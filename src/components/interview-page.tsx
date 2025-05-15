
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { generateInterviewQuestion, type GenerateInterviewQuestionInput, type GenerateInterviewQuestionOutput } from "@/ai/flows/generate-interview-question";
import { generateAnswerFeedback, type GenerateAnswerFeedbackInput, type GenerateAnswerFeedbackOutput } from "@/ai/flows/generate-answer-feedback";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { AppLogo } from "@/components/icons";
import { Briefcase, Building2, Mic, Send, RefreshCw, Loader2, CheckCircle, Info, Lightbulb, MessageSquare, ThumbsUp, Brain, Target, ThumbsDown, Check, Star, TrendingUp } from "lucide-react";
import { formatTime, cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";

const ROLES = [
  { value: "Software Engineer", label: "Software Engineer" },
  { value: "Product Manager", label: "Product Manager" },
  { value: "Data Scientist", label: "Data Scientist" },
  { value: "UX Designer", label: "UX Designer" },
  { value: "Sales Representative", label: "Sales Representative" },
  { value: "Marketing Specialist", label: "Marketing Specialist" },
];

const INDUSTRIES = [
  { value: "Technology", label: "Technology" },
  { value: "Finance", label: "Finance" },
  { value: "Healthcare", label: "Healthcare" },
  { value: "E-commerce", label: "E-commerce" },
  { value: "Consulting", label: "Consulting" },
  { value: "Education", label: "Education" },
];

const FOCUS_AREAS = [
  { value: "Technical Skills & Experience", label: "Technical Skills & Experience" },
  { value: "Problem Solving & Critical Thinking", label: "Problem Solving & Critical Thinking" },
  { value: "Communication & Interpersonal Skills", label: "Communication & Interpersonal Skills" },
  { value: "Behavioral & Situational Questions", label: "Behavioral & Situational Questions" },
  { value: "Cultural Fit & Teamwork", label: "Cultural Fit & Teamwork" },
  { value: "Leadership & Initiative", label: "Leadership & Initiative" },
];

const OTHER_VALUE = "other";

const formSchema = z.object({
  roleSelection: z.string({ required_error: "Please select a role or choose 'Other'."}).min(1, "Please select a role or choose 'Other'."),
  customRole: z.string().optional(),
  industrySelection: z.string({ required_error: "Please select an industry or choose 'Other'."}).min(1, "Please select an industry or choose 'Other'."),
  customIndustry: z.string().optional(),
  focusSelection: z.string({ required_error: "Please select an interview focus or choose 'Other'."}).min(1, "Please select an interview focus or choose 'Other'."),
  customFocus: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.roleSelection === OTHER_VALUE && (!data.customRole || data.customRole.trim().length < 2)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Role must be at least 2 characters.",
      path: ["customRole"],
    });
  }
  if (data.industrySelection === OTHER_VALUE && (!data.customIndustry || data.customIndustry.trim().length < 2)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Industry must be at least 2 characters.",
      path: ["customIndustry"],
    });
  }
  if (data.focusSelection === OTHER_VALUE && (!data.customFocus || data.customFocus.trim().length < 2)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Focus must be at least 2 characters.",
      path: ["customFocus"],
    });
  }
});


type CurrentStep = "initial" | "question_generated" | "feedback_generated";

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  onresult: ((this: SpeechRecognition, ev: any) => any) | null;
  onerror: ((this: SpeechRecognition, ev: any) => any) | null;
  onend: ((this: SpeechRecognition, ev: Event) => any) | null;
}

declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition;
    webkitSpeechRecognition: typeof SpeechRecognition;
  }
}

const getScoreColor = (score: number | undefined): string => {
  if (score === undefined) return "text-muted-foreground"; 
  if (score <= 1) return "text-red-500";
  if (score === 2) return "text-orange-500";
  if (score === 3) return "text-yellow-500";
  if (score === 4) return "text-lime-500"; 
  if (score >= 5) return "text-green-600";
  return "text-muted-foreground";
};

const renderFeedbackIcon = (
  score: number | undefined,
  iconType: 'overall' | 'clarity' | 'completeness' | 'relevance'
) => {
  const color = getScoreColor(score);
  let IconComponent;

  switch (iconType) {
    case 'overall':
      IconComponent = (typeof score === 'number' && score <= 2) ? ThumbsDown : ThumbsUp;
      break;
    case 'clarity':
      IconComponent = Brain;
      break;
    case 'completeness':
      IconComponent = Info;
      break;
    case 'relevance':
      IconComponent = Target;
      break;
    default: // Should not happen with defined types
      IconComponent = CheckCircle; 
  }
  return <IconComponent className={`mr-2 h-5 w-5 ${color}`} />;
};


export default function InterviewPage() {
  const [currentStep, setCurrentStep] = useState<CurrentStep>("initial");
  const [generatedQuestion, setGeneratedQuestion] = useState<GenerateInterviewQuestionOutput | null>(null);
  const [currentQuestionParams, setCurrentQuestionParams] = useState<GenerateInterviewQuestionInput | null>(null);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<GenerateAnswerFeedbackOutput | null>(null);
  const [isLoadingQuestion, setIsLoadingQuestion] = useState(false);
  const [isLoadingFeedback, setIsLoadingFeedback] = useState(false);
  
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isStopwatchRunning, setIsStopwatchRunning] = useState(false);
  const stopwatchIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const speechRecognitionRef = useRef<SpeechRecognition | null>(null);
  const textBeforeRecordingRef = useRef<string>("");
  const lastInterimRef = useRef<string>("");
  
  const { toast } = useToast();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { 
      roleSelection: "", 
      customRole: "", 
      industrySelection: "", 
      customIndustry: "",
      focusSelection: "",
      customFocus: ""
    },
  });

  const watchedRoleSelection = form.watch("roleSelection");
  const watchedIndustrySelection = form.watch("industrySelection");
  const watchedFocusSelection = form.watch("focusSelection");

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognitionAPI && !speechRecognitionRef.current) {
        const recognitionInstance = new SpeechRecognitionAPI();
        recognitionInstance.continuous = true;
        recognitionInstance.lang = 'en-US';
        recognitionInstance.interimResults = true;

        recognitionInstance.onresult = (event: any) => {
          let interimTranscript = '';
          let finalTranscript = '';
        
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              finalTranscript += event.results[i][0].transcript + ' ';
            } else {
              interimTranscript += event.results[i][0].transcript;
            }
          }
        
          // Use the text captured before recording started as the base
          let currentAnswer = textBeforeRecordingRef.current;
        
          // Append finalized transcript
          if (finalTranscript.trim()) {
            if (currentAnswer && !currentAnswer.endsWith(' ')) {
              currentAnswer += ' ';
            }
            currentAnswer += finalTranscript.trim();
            textBeforeRecordingRef.current = currentAnswer; // Update base for next final result
            lastInterimRef.current = ""; // Reset interim since we got a final
          }
        
          // Handle interim transcript - show current interim results appended to the most recent final text
          // This replaces the last interim result rather than appending, to avoid duplication.
          if (interimTranscript.trim()) {
            let textToShow = textBeforeRecordingRef.current; // Start with everything finalized so far
            if (textToShow && !textToShow.endsWith(' ')) {
                textToShow += ' ';
            }
            textToShow += interimTranscript.trim();
            setAnswer(textToShow);
            lastInterimRef.current = interimTranscript.trim(); // Store current interim
          } else if (finalTranscript.trim()) {
            // If there was a final transcript but no new interim, just show the updated final
            setAnswer(currentAnswer);
          }
        };
                
        recognitionInstance.onerror = (event: any) => {
          console.error("Speech recognition error", event.error);
          toast({
            title: "Speech Recognition Error",
            description: event.error === 'no-speech' ? "No speech detected. Please try again." : event.error === 'audio-capture' ? "Audio capture failed. Check microphone." : "An error occurred during speech recognition.",
            variant: "destructive",
          });
          if(isRecording) setIsRecording(false);
        };
    
        recognitionInstance.onend = () => {
          // Ensure the final state of the answer reflects the last known text.
          // textBeforeRecordingRef should have the most up-to-date fully finalized text.
          // If there was an unfinalized interim text, append it.
          let finalAnswer = textBeforeRecordingRef.current;
          if (lastInterimRef.current) {
            if (finalAnswer && !finalAnswer.endsWith(' ')) finalAnswer += ' ';
            finalAnswer += lastInterimRef.current;
          }
          setAnswer(finalAnswer);
          textBeforeRecordingRef.current = finalAnswer; // Update for potential next recording session
          lastInterimRef.current = ""; // Clear last interim

          if (isRecording) {
             setIsRecording(false);
          }
        };
        speechRecognitionRef.current = recognitionInstance;
      } else if (!SpeechRecognitionAPI) {
        console.warn("Speech Recognition API not supported in this browser.");
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast]); // isRecording removed

  const startStopwatch = useCallback(() => {
    if (stopwatchIntervalRef.current) clearInterval(stopwatchIntervalRef.current);
    setElapsedTime(0);
    setIsStopwatchRunning(true);
    stopwatchIntervalRef.current = setInterval(() => {
      setElapsedTime(prevTime => prevTime + 1);
    }, 1000);
  }, []);

  const stopStopwatch = useCallback(() => {
    if (stopwatchIntervalRef.current) {
      clearInterval(stopwatchIntervalRef.current);
      stopwatchIntervalRef.current = null;
    }
    setIsStopwatchRunning(false);
  }, []);

  const handleGenerateQuestion = async (values: z.infer<typeof formSchema>) => {
    setIsLoadingQuestion(true);
    setGeneratedQuestion(null);
    setFeedback(null);
    setAnswer("");
    textBeforeRecordingRef.current = ""; 
    lastInterimRef.current = "";
    if (isRecording && speechRecognitionRef.current) {
      speechRecognitionRef.current.stop(); 
    }

    const questionPayload: GenerateInterviewQuestionInput = {
      role: values.roleSelection === OTHER_VALUE ? values.customRole! : values.roleSelection,
      industry: values.industrySelection === OTHER_VALUE ? values.customIndustry! : values.industrySelection,
      interviewFocus: values.focusSelection === OTHER_VALUE ? values.customFocus! : values.focusSelection,
    };
    setCurrentQuestionParams(questionPayload);

    try {
      const questionData = await generateInterviewQuestion(questionPayload);
      setGeneratedQuestion(questionData);
      setCurrentStep("question_generated");
      startStopwatch();
    } catch (error) {
      console.error("Error generating question:", error);
      toast({
        title: "Error",
        description: "Failed to generate interview question. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingQuestion(false);
    }
  };

  const handleGetFeedback = async () => {
    if (!generatedQuestion || !currentQuestionParams) return;
    setIsLoadingFeedback(true);
    setFeedback(null);
    stopStopwatch();
    if (isRecording && speechRecognitionRef.current) {
      speechRecognitionRef.current.stop();
    }
    try {
      const feedbackData = await generateAnswerFeedback({
        question: generatedQuestion.question,
        answer,
        role: currentQuestionParams.role,
        industry: currentQuestionParams.industry,
      } as GenerateAnswerFeedbackInput); // Assuming feedback flow doesn't need interviewFocus yet. Add if it does.
      setFeedback(feedbackData);
      setCurrentStep("feedback_generated");
    } catch (error) {
      console.error("Error generating feedback:", error);
      toast({
        title: "Error",
        description: "Failed to generate feedback. The AI might be having trouble, or your answer is too short. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingFeedback(false);
    }
  };

  const toggleRecording = () => {
    if (!speechRecognitionRef.current) {
       toast({
        title: "Unsupported Feature",
        description: "Speech recognition is not supported in your browser.",
        variant: "destructive",
      });
      return;
    }
    if (isRecording) {
      speechRecognitionRef.current.stop(); 
    } else {
      try {
        textBeforeRecordingRef.current = answer;
        lastInterimRef.current = ""; // Reset last interim on new recording start
        speechRecognitionRef.current.start();
        setIsRecording(true);
        if (!isStopwatchRunning && currentStep === "question_generated") {
          startStopwatch(); 
        }
      } catch (e: any) {
        console.error("Error starting speech recognition:", e);
        let description = "Could not start speech recognition. Please check microphone permissions.";
        if (e.name === 'InvalidStateError') {
          description = "Speech recognition is already active or in an invalid state. Please wait or refresh.";
        }
        toast({
            title: "Speech Recognition Error",
            description: description,
            variant: "destructive",
        });
        setIsRecording(false);
      }
    }
  };

  const handleStartOver = () => {
    form.reset({ 
      roleSelection: "", 
      customRole: "", 
      industrySelection: "", 
      customIndustry: "",
      focusSelection: "",
      customFocus: ""
    });
    setGeneratedQuestion(null);
    setCurrentQuestionParams(null);
    setAnswer("");
    setFeedback(null);
    setCurrentStep("initial");
    setElapsedTime(0);
    stopStopwatch();
    textBeforeRecordingRef.current = "";
    lastInterimRef.current = "";
    if (isRecording && speechRecognitionRef.current) {
      speechRecognitionRef.current.stop();
    }
  };

  useEffect(() => {
    return () => {
      if (stopwatchIntervalRef.current) {
        clearInterval(stopwatchIntervalRef.current);
      }
      if (speechRecognitionRef.current) {
         if(isRecording) speechRecognitionRef.current.stop();
         speechRecognitionRef.current.onresult = null;
         speechRecognitionRef.current.onerror = null;
         speechRecognitionRef.current.onend = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRecording]);


  const renderRadioOptions = (
    field: any, 
    options: {value: string, label: string}[], 
    currentSelection: string | undefined,
    fieldIdPrefix: string
  ) => (
    <RadioGroup
      onValueChange={field.onChange}
      value={field.value} // Use field.value for controlled component
      className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3"
    >
      {options.map((option) => (
        <FormItem key={option.value}>
          <FormControl>
            <RadioGroupItem value={option.value} id={`${fieldIdPrefix}-${option.value}`} className="sr-only" />
          </FormControl>
          <Label
            htmlFor={`${fieldIdPrefix}-${option.value}`}
            className={cn(
              "flex items-center justify-center rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground cursor-pointer font-medium",
              "transition-all duration-150 ease-in-out",
              field.value === option.value
                ? "border-primary bg-primary/10 text-primary ring-2 ring-primary"
                : "hover:border-muted-foreground/50"
            )}
          >
            {field.value === option.value && <Check className="mr-2 h-5 w-5 text-primary" />}
            {option.label}
          </Label>
        </FormItem>
      ))}
      <FormItem>
        <FormControl>
          <RadioGroupItem value={OTHER_VALUE} id={`${fieldIdPrefix}-${OTHER_VALUE}`} className="sr-only" />
        </FormControl>
        <Label
          htmlFor={`${fieldIdPrefix}-${OTHER_VALUE}`}
          className={cn(
            "flex items-center justify-center rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground cursor-pointer font-medium",
            "transition-all duration-150 ease-in-out",
            field.value === OTHER_VALUE
              ? "border-primary bg-primary/10 text-primary ring-2 ring-primary"
              : "hover:border-muted-foreground/50"
          )}
        >
          {field.value === OTHER_VALUE && <Check className="mr-2 h-5 w-5 text-primary" />}
          Other
        </Label>
      </FormItem>
    </RadioGroup>
  );


  return (
    <div className="flex flex-col min-h-screen bg-background">
      <header className="py-6 px-4 md:px-8 border-b border-border">
        <div className="container mx-auto flex items-center justify-between">
          <AppLogo />
          {currentStep !== "initial" && (
             <Button variant="outline" onClick={handleStartOver}>
              <RefreshCw className="mr-2 h-4 w-4" /> Start Over
            </Button>
          )}
        </div>
      </header>

      <main className="flex-grow container mx-auto p-4 md:p-8">
        <div className="max-w-3xl mx-auto space-y-8">
          {currentStep === "initial" && (
            <Card className="shadow-lg animate-in fade-in-0 duration-500">
              <CardHeader>
                <CardTitle className="text-2xl">Let's Get Started</CardTitle>
                <CardDescription>Tell us about the role, industry, and focus for your mock interview.</CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(handleGenerateQuestion)} className="space-y-8">
                    {/* Role Selection */}
                    <FormField
                      control={form.control}
                      name="roleSelection"
                      render={({ field }) => (
                        <FormItem className="space-y-3">
                          <FormLabel className="text-lg flex items-center"><Briefcase className="mr-2 h-5 w-5 text-muted-foreground" /> Your Desired Role</FormLabel>
                          <FormControl>
                            <>
                              {renderRadioOptions(field, ROLES, watchedRoleSelection, "role")}
                            </>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    {watchedRoleSelection === OTHER_VALUE && (
                      <FormField
                        control={form.control}
                        name="customRole"
                        render={({ field }) => (
                          <FormItem className="animate-in fade-in-0 duration-300">
                            <FormLabel className="text-base">Specify Role</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g., DevOps Engineer" {...field} className="text-base" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}

                    {/* Industry Selection */}
                    <FormField
                      control={form.control}
                      name="industrySelection"
                      render={({ field }) => (
                        <FormItem className="space-y-3">
                          <FormLabel className="text-lg flex items-center"><Building2 className="mr-2 h-5 w-5 text-muted-foreground" /> Target Industry</FormLabel>
                          <FormControl>
                             <>
                              {renderRadioOptions(field, INDUSTRIES, watchedIndustrySelection, "industry")}
                            </>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    {watchedIndustrySelection === OTHER_VALUE && (
                      <FormField
                        control={form.control}
                        name="customIndustry"
                        render={({ field }) => (
                          <FormItem className="animate-in fade-in-0 duration-300">
                            <FormLabel className="text-base">Specify Industry</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g., Biotechnology" {...field} className="text-base" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}

                    {/* Interview Focus Selection */}
                    <FormField
                      control={form.control}
                      name="focusSelection"
                      render={({ field }) => (
                        <FormItem className="space-y-3">
                          <FormLabel className="text-lg flex items-center"><TrendingUp className="mr-2 h-5 w-5 text-muted-foreground" /> Interview Focus</FormLabel>
                          <FormControl>
                            <>
                              {renderRadioOptions(field, FOCUS_AREAS, watchedFocusSelection, "focus")}
                            </>
                          </FormControl>
                           <FormDescription>Select the primary area the interview question should target.</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    {watchedFocusSelection === OTHER_VALUE && (
                      <FormField
                        control={form.control}
                        name="customFocus"
                        render={({ field }) => (
                          <FormItem className="animate-in fade-in-0 duration-300">
                            <FormLabel className="text-base">Specify Focus</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g., System Design" {...field} className="text-base" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                    
                    <Button type="submit" disabled={isLoadingQuestion} className="w-full text-lg py-6">
                      {isLoadingQuestion ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Lightbulb className="mr-2 h-5 w-5" />}
                      Generate Interview Question
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>
          )}

          {isLoadingQuestion && currentStep === "initial" && (
             <Card className="shadow-lg">
              <CardHeader>
                <Skeleton className="h-8 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </CardHeader>
              <CardContent className="space-y-4">
                <Skeleton className="h-10 w-full" />
                 <Skeleton className="h-20 w-full" />
                <Skeleton className="h-10 w-full" />
                 <Skeleton className="h-20 w-full" />
                <Skeleton className="h-10 w-full" />
                 <Skeleton className="h-20 w-full" />
                <Skeleton className="h-12 w-full mt-4" />
              </CardContent>
            </Card>
          )}

          {currentStep === "question_generated" && generatedQuestion && (
            <div className="space-y-8 animate-in fade-in-0 duration-500">
              <Card className="shadow-lg">
                <CardHeader>
                  <CardTitle className="text-2xl flex items-center"><Lightbulb className="mr-3 h-7 w-7 text-primary" />Your Interview Question:</CardTitle>
                   {currentQuestionParams && (
                    <CardDescription className="text-sm">
                      For Role: <span className="font-semibold text-primary">{currentQuestionParams.role}</span> <br/>
                      In Industry: <span className="font-semibold text-primary">{currentQuestionParams.industry}</span> <br/>
                      Focusing on: <span className="font-semibold text-primary">{currentQuestionParams.interviewFocus}</span>
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent>
                  <p className="text-xl leading-relaxed">{generatedQuestion.question}</p>
                </CardContent>
              </Card>

              <Card className="shadow-lg">
                <CardHeader>
                  <CardTitle className="text-2xl flex items-center"><MessageSquare className="mr-3 h-7 w-7 text-primary" />Your Answer</CardTitle>
                  <div className="flex justify-between items-center">
                    <CardDescription>Record or type your response below.</CardDescription>
                    <div className="text-lg font-semibold tabular-nums px-3 py-1 bg-secondary text-secondary-foreground rounded-md">
                      {formatTime(elapsedTime)}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <Textarea
                    placeholder="Type your answer here..."
                    value={answer}
                    onChange={(e) => {
                      if (!isRecording) { 
                        setAnswer(e.target.value);
                        textBeforeRecordingRef.current = e.target.value; 
                      }
                    }}
                    rows={8}
                    className="text-base leading-relaxed mb-4"
                    aria-label="Your answer"
                    readOnly={isRecording} 
                  />
                  <div className="flex flex-col sm:flex-row gap-4">
                    <Button onClick={toggleRecording} variant={isRecording ? "destructive" : "outline"} className="flex-1 text-base py-3">
                      <Mic className="mr-2 h-5 w-5" /> {isRecording ? "Stop Recording" : "Record with Voice"}
                    </Button>
                    <Button onClick={handleGetFeedback} disabled={isLoadingFeedback || answer.trim() === ""} className="flex-1 text-base py-3">
                      {isLoadingFeedback ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Send className="mr-2 h-5 w-5" />}
                      Get Feedback
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
          
          {isLoadingFeedback && currentStep === "question_generated" && (
            <Card className="shadow-lg">
              <CardHeader>
                 <Skeleton className="h-8 w-1/2" />
              </CardHeader>
              <CardContent className="space-y-2">
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-5/6" />
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-4/6" />
              </CardContent>
            </Card>
          )}


          {currentStep === "feedback_generated" && feedback && (
            <Card className="shadow-lg animate-in fade-in-0 duration-500">
              <CardHeader>
                <CardTitle className="text-2xl flex items-center"><CheckCircle className="mr-3 h-7 w-7 text-accent" />Feedback on Your Answer</CardTitle>
                <CardDescription>Here's an analysis of your response. Use this to improve!</CardDescription>
              </CardHeader>
              <CardContent>
                <Accordion type="single" collapsible defaultValue="item-1" className="w-full">
                  <AccordionItem value="item-1">
                    <AccordionTrigger className="text-xl hover:no-underline">
                       {renderFeedbackIcon(feedback.overallFeedback?.score, 'overall')}
                      Overall Feedback
                    </AccordionTrigger>
                    <AccordionContent className="text-base leading-relaxed p-1">
                      {feedback.overallFeedback?.text} (Score: <span className={cn("font-bold", getScoreColor(feedback.overallFeedback?.score))}>{feedback.overallFeedback?.score}</span>/5)
                    </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="item-2">
                    <AccordionTrigger className="text-xl hover:no-underline">
                       {renderFeedbackIcon(feedback.clarity?.score, 'clarity')}
                       Clarity
                    </AccordionTrigger>
                    <AccordionContent className="text-base leading-relaxed p-1">
                       {feedback.clarity?.text} (Score: <span className={cn("font-bold", getScoreColor(feedback.clarity?.score))}>{feedback.clarity?.score}</span>/5)
                    </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="item-3">
                    <AccordionTrigger className="text-xl hover:no-underline">
                       {renderFeedbackIcon(feedback.completeness?.score, 'completeness')}
                       Completeness
                    </AccordionTrigger>
                    <AccordionContent className="text-base leading-relaxed p-1">
                       {feedback.completeness?.text} (Score: <span className={cn("font-bold", getScoreColor(feedback.completeness?.score))}>{feedback.completeness?.score}</span>/5)
                    </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="item-4">
                    <AccordionTrigger className="text-xl hover:no-underline">
                       {renderFeedbackIcon(feedback.relevance?.score, 'relevance')}
                       Relevance
                    </AccordionTrigger>
                    <AccordionContent className="text-base leading-relaxed p-1">
                       {feedback.relevance?.text} (Score: <span className={cn("font-bold", getScoreColor(feedback.relevance?.score))}>{feedback.relevance?.score}</span>/5)
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </CardContent>
              <CardFooter>
                <Button onClick={handleStartOver} className="w-full text-lg py-6">
                  <RefreshCw className="mr-2 h-5 w-5" /> Practice Again
                </Button>
              </CardFooter>
            </Card>
          )}
        </div>
      </main>

      <footer className="py-6 px-4 md:px-8 border-t mt-auto border-border">
        <div className="container mx-auto text-center text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} AceInterview. Powered by AI.</p>
        </div>
      </footer>
    </div>
  );
}
