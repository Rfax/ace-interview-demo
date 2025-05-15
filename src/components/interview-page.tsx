
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { generateInterviewQuestion, type GenerateInterviewQuestionInput, type GenerateInterviewQuestionOutput } from "@/ai/flows/generate-interview-question";
import { generateOverallInterviewFeedback, type GenerateOverallInterviewFeedbackInput, type GenerateOverallInterviewFeedbackOutput, type IndividualFeedback } from "@/ai/flows/generate-overall-interview-feedback";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { AppLogo } from "@/components/icons";
import { Briefcase, Building2, Mic, Send, RefreshCw, Loader2, CheckCircle, Info, Lightbulb, MessageSquare, ThumbsUp, Brain, Target, ThumbsDown, Check, TrendingUp, CornerDownRight, ListChecks, Sparkles } from "lucide-react";
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
  focusSelections: z.array(z.string()).min(1, "Please select at least one interview focus area."),
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
  if (data.focusSelections.includes(OTHER_VALUE)) {
    if ((!data.customFocus || data.customFocus.trim().length < 2)) {
        if (data.focusSelections.length === 1) { // Only "Other" is selected
             ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Custom focus must be at least 2 characters when 'Other' is the only selection.",
                path: ["customFocus"],
            });
        } else if (data.customFocus && data.customFocus.trim().length > 0 && data.customFocus.trim().length < 2) {
            // "Other" is selected along with others, AND customFocus is filled but too short
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Custom focus must be at least 2 characters if specified.",
                path: ["customFocus"],
            });
        }
    }
  }
   if (data.focusSelections.length === 0) {
     ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Please select at least one interview focus area.",
      path: ["focusSelections"],
    });
  }
});


type CurrentStep = "initial" | "question_generated" | "overall_feedback_generated";
interface InterviewRound {
  question: GenerateInterviewQuestionOutput;
  answer: string;
}

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
  let IconComponent: React.ElementType = CheckCircle; // Default icon

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
  }
  return <IconComponent className={cn("mr-2 h-5 w-5 shrink-0", color)} />;
};


export default function InterviewPage() {
  const [currentStep, setCurrentStep] = useState<CurrentStep>("initial");
  const [generatedQuestion, setGeneratedQuestion] = useState<GenerateInterviewQuestionOutput | null>(null);
  const [currentQuestionParams, setCurrentQuestionParams] = useState<Omit<GenerateInterviewQuestionInput, 'interviewFocus'> & { interviewFocus: string[] } | null>(null);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<GenerateOverallInterviewFeedbackOutput | null>(null);
  const [isLoadingQuestion, setIsLoadingQuestion] = useState(false);
  const [isLoadingFeedback, setIsLoadingFeedback] = useState(false);
  const [interviewRounds, setInterviewRounds] = useState<InterviewRound[]>([]);

  const [elapsedTime, setElapsedTime] = useState(0);
  const [isStopwatchRunning, setIsStopwatchRunning] = useState(false);
  const stopwatchIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const speechRecognitionRef = useRef<SpeechRecognition | null>(null);
  const textBeforeRecordingRef = useRef<string>("");
  const currentSpokenTextRef = useRef<string>("");


  const { toast } = useToast();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      roleSelection: "",
      customRole: "",
      industrySelection: "",
      customIndustry: "",
      focusSelections: [],
      customFocus: ""
    },
  });

  const watchedRoleSelection = form.watch("roleSelection");
  const watchedIndustrySelection = form.watch("industrySelection");
  const watchedFocusSelections = form.watch("focusSelections");

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
          let finalTranscriptSegment = '';

          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              finalTranscriptSegment += event.results[i][0].transcript + ' ';
            } else {
              interimTranscript += event.results[i][0].transcript;
            }
          }
          
          // Update current spoken text (both final and interim parts for this session)
          // If there's new final text, append it to the ref
          if (finalTranscriptSegment) {
            currentSpokenTextRef.current += finalTranscriptSegment;
          }
          
          // Combine text before recording, finalized spoken text for this session, and current interim text
          setAnswer(textBeforeRecordingRef.current + currentSpokenTextRef.current + interimTranscript);
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
            // currentSpokenTextRef already has the final part. The last interim is discarded.
            // textBeforeRecordingRef needs to be updated to include the spoken text from this session
            // so the *next* recording session starts from the correct place.
            if (isRecording) { // Check if it was recording before stopping
                textBeforeRecordingRef.current = textBeforeRecordingRef.current + currentSpokenTextRef.current;
                currentSpokenTextRef.current = ""; // Reset for next session
                setIsRecording(false);
            }
        };
        speechRecognitionRef.current = recognitionInstance;
      } else if (!SpeechRecognitionAPI) {
        console.warn("Speech Recognition API not supported in this browser.");
        // Consider toasting here that mic input won't work
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast]);


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

  const processAndStoreCurrentRound = () => {
    if (generatedQuestion && answer.trim().length > 0) {
      setInterviewRounds(prevRounds => [...prevRounds, { question: generatedQuestion, answer }]);
    } else if (generatedQuestion && answer.trim().length === 0 && interviewRounds.every(r => r.question.question !== generatedQuestion.question)) {
      // Store question even if answer is empty, if it's a new question
      setInterviewRounds(prevRounds => [...prevRounds, { question: generatedQuestion, answer: "" }]);
    }
  };

  const fetchNewQuestion = async (params: GenerateInterviewQuestionInput) => {
    setIsLoadingQuestion(true);
    setGeneratedQuestion(null);
    setAnswer("");
    textBeforeRecordingRef.current = "";
    currentSpokenTextRef.current = "";

    if (isRecording && speechRecognitionRef.current) {
      speechRecognitionRef.current.stop();
      setIsRecording(false);
    }

    try {
      const questionData = await generateInterviewQuestion(params);
      setGeneratedQuestion(questionData);
      setCurrentStep("question_generated"); // Should already be here, but for safety
      startStopwatch();
    } catch (error) {
      console.error("Error generating question:", error);
      toast({
        title: "Error",
        description: "Failed to generate new interview question. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingQuestion(false);
    }
  };


  const handleGenerateFirstQuestion = async (values: z.infer<typeof formSchema>) => {
    setIsLoadingQuestion(true);
    setGeneratedQuestion(null);
    setFeedback(null);
    setAnswer("");
    textBeforeRecordingRef.current = "";
    currentSpokenTextRef.current = "";
    setInterviewRounds([]);
    if (isRecording && speechRecognitionRef.current) {
      speechRecognitionRef.current.stop();
      setIsRecording(false);
    }

    const role = values.roleSelection === OTHER_VALUE ? values.customRole! : values.roleSelection;
    const industry = values.industrySelection === OTHER_VALUE ? values.customIndustry! : values.industrySelection;

    let actualFocuses: string[] = values.focusSelections.filter(focus => focus !== OTHER_VALUE);
    if (values.focusSelections.includes(OTHER_VALUE) && values.customFocus && values.customFocus.trim().length > 0) {
      actualFocuses.push(values.customFocus.trim());
    }
     if (actualFocuses.length === 0 && values.focusSelections.length > 0 && values.focusSelections.includes(OTHER_VALUE)) {
        if (!values.customFocus || values.customFocus.trim().length === 0) {
             toast({ title: "Focus Error", description: "Please specify your 'Other' focus area or select a predefined one.", variant: "destructive"});
             setIsLoadingQuestion(false);
             return;
        }
    }
     if (actualFocuses.length === 0) {
        toast({ title: "Focus Error", description: "Please select at least one focus area.", variant: "destructive"});
        setIsLoadingQuestion(false);
        return;
    }


    const questionPayload: GenerateInterviewQuestionInput = {
      role,
      industry,
      interviewFocus: actualFocuses,
    };
    setCurrentQuestionParams(questionPayload);
    await fetchNewQuestion(questionPayload); // Use the generalized fetchNewQuestion
  };

  const handleNextQuestion = async () => {
    if (!currentQuestionParams) return;
    processAndStoreCurrentRound();
    await fetchNewQuestion(currentQuestionParams);
  };


  const handleEndInterviewAndGetFeedback = async () => {
    if (!currentQuestionParams) return; // Should not happen if questions were generated

    // Ensure the last answer is captured
    if (generatedQuestion) { // If there's an active question
         const existingRoundIndex = interviewRounds.findIndex(r => r.question.question === generatedQuestion.question);
         if (existingRoundIndex !== -1) {
            // Update existing round if answer changed
            if (interviewRounds[existingRoundIndex].answer !== answer) {
                const updatedRounds = [...interviewRounds];
                updatedRounds[existingRoundIndex] = { ...updatedRounds[existingRoundIndex], answer };
                setInterviewRounds(updatedRounds);
            }
         } else {
            // Add as new round if not present (e.g. first question, or user types then ends)
             setInterviewRounds(prevRounds => [...prevRounds, { question: generatedQuestion, answer }]);
         }
    }


    setIsLoadingFeedback(true);
    setFeedback(null);
    stopStopwatch();
    if (isRecording && speechRecognitionRef.current) {
      speechRecognitionRef.current.stop();
      setIsRecording(false);
    }

    // Use a slight delay to ensure interviewRounds state is updated from the last capture
    setTimeout(async () => {
        if (interviewRounds.length === 0 && generatedQuestion && answer.trim().length > 0) {
            // Special case: only one question asked and answered, then "End" is clicked.
            // The interviewRounds might not have been updated yet if processAndStoreCurrentRound wasn't explicitly called.
            // This is a fallback; ideally, the logic above handles it.
             try {
                const feedbackData = await generateOverallInterviewFeedback({
                    role: currentQuestionParams.role,
                    industry: currentQuestionParams.industry,
                    interviewRounds: [{ questionText: generatedQuestion.question, answerText: answer }],
                });
                setFeedback(feedbackData);
                setCurrentStep("overall_feedback_generated");
            } catch (error) {
                console.error("Error generating overall feedback:", error);
                toast({
                    title: "Error",
                    description: "Failed to generate overall feedback. The AI might be having trouble. Please try again.",
                    variant: "destructive",
                });
            } finally {
                setIsLoadingFeedback(false);
            }
            return;
        }


        if (interviewRounds.length === 0) {
            toast({
                title: "No Answers",
                description: "Please answer at least one question before ending the interview.",
                variant: "destructive",
            });
            setIsLoadingFeedback(false);
            return;
        }

        try {
        const payload: GenerateOverallInterviewFeedbackInput = {
            role: currentQuestionParams.role,
            industry: currentQuestionParams.industry,
            interviewRounds: interviewRounds.map(r => ({ questionText: r.question.question, answerText: r.answer })),
        };
        const feedbackData = await generateOverallInterviewFeedback(payload);
        setFeedback(feedbackData);
        setCurrentStep("overall_feedback_generated");
        } catch (error) {
        console.error("Error generating overall feedback:", error);
        toast({
            title: "Error",
            description: "Failed to generate overall feedback. The AI might be having trouble. Please try again.",
            variant: "destructive",
        });
        } finally {
        setIsLoadingFeedback(false);
        }
    }, 100); // 100ms delay
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
      // isRecording will be set to false by the onend handler
    } else {
      try {
        // textBeforeRecordingRef should hold everything *before* this new spoken segment
        textBeforeRecordingRef.current = answer;
        currentSpokenTextRef.current = ""; // Clear spoken text from previous attempts in this session
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
      focusSelections: [],
      customFocus: ""
    });
    setGeneratedQuestion(null);
    setCurrentQuestionParams(null);
    setAnswer("");
    setFeedback(null);
    setCurrentStep("initial");
    setElapsedTime(0);
    stopStopwatch();
    setInterviewRounds([]);
    textBeforeRecordingRef.current = "";
    currentSpokenTextRef.current = "";
    if (isRecording && speechRecognitionRef.current) {
      speechRecognitionRef.current.stop();
      setIsRecording(false);
    }
  };

  useEffect(() => {
    return () => {
      if (stopwatchIntervalRef.current) {
        clearInterval(stopwatchIntervalRef.current);
      }
      if (speechRecognitionRef.current) {
         if(speechRecognitionRef.current && typeof (speechRecognitionRef.current as any).readyState !== 'undefined' && (speechRecognitionRef.current as any).readyState === 1){
            try {
                speechRecognitionRef.current.stop();
            } catch (e) {
                // console.warn("Error stopping speech recognition on cleanup:", e);
            }
         }
         speechRecognitionRef.current.onresult = null;
         speechRecognitionRef.current.onerror = null;
         speechRecognitionRef.current.onend = null;
      }
    };
  }, []);


  const renderRadioOptions = (
    field: any,
    options: {value: string, label: string}[],
    fieldIdPrefix: string
  ) => (
    <RadioGroup
      onValueChange={field.onChange}
      value={field.value}
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
              "flex items-center justify-center rounded-md border-2 border-muted bg-popover p-4 cursor-pointer font-medium h-full",
              "transition-all duration-150 ease-in-out",
              "hover:border-primary hover:bg-primary/10 hover:text-primary hover:ring-2 hover:ring-primary",
              field.value === option.value
                ? "border-primary bg-primary/10 text-primary ring-2 ring-primary"
                : "border-muted"
            )}
          >
            {field.value === option.value && <Check className="mr-2 h-5 w-5 text-primary shrink-0" />}
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
            "flex items-center justify-center rounded-md border-2 bg-popover p-4 cursor-pointer font-medium h-full",
            "transition-all duration-150 ease-in-out",
            "hover:border-primary hover:bg-primary/10 hover:text-primary hover:ring-2 hover:ring-primary",
            field.value === OTHER_VALUE
              ? "border-primary bg-primary/10 text-primary ring-2 ring-primary"
              : "border-muted"
          )}
        >
          {field.value === OTHER_VALUE && <Check className="mr-2 h-5 w-5 text-primary shrink-0" />}
          Other
        </Label>
      </FormItem>
    </RadioGroup>
  );

  const renderCheckboxOptions = (
    field: any, 
    options: {value: string, label: string}[],
    fieldIdPrefix: string
  ) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
      {options.map((option) => (
        <FormItem key={option.value} className="flex items-center space-x-0">
          <FormControl>
            <Checkbox
              id={`${fieldIdPrefix}-${option.value}`}
              checked={field.value?.includes(option.value)}
              onCheckedChange={(checked) => {
                const currentValue = field.value || [];
                return checked
                  ? field.onChange([...currentValue, option.value])
                  : field.onChange(currentValue?.filter((v: string) => v !== option.value));
              }}
              className="sr-only"
            />
          </FormControl>
          <Label
            htmlFor={`${fieldIdPrefix}-${option.value}`}
            className={cn(
              "flex w-full items-center justify-center rounded-md border-2 border-muted bg-popover p-4 cursor-pointer font-medium h-full",
              "transition-all duration-150 ease-in-out",
              "hover:border-primary hover:bg-primary/10 hover:text-primary hover:ring-2 hover:ring-primary",
              field.value?.includes(option.value)
                ? "border-primary bg-primary/10 text-primary ring-2 ring-primary"
                : "border-muted"
            )}
          >
            {field.value?.includes(option.value) && <Check className="mr-2 h-5 w-5 text-primary shrink-0" />}
            {option.label}
          </Label>
        </FormItem>
      ))}
      <FormItem className="flex items-center space-x-0">
        <FormControl>
          <Checkbox
            id={`${fieldIdPrefix}-${OTHER_VALUE}`}
            checked={field.value?.includes(OTHER_VALUE)}
            onCheckedChange={(checked) => {
              const currentValue = field.value || [];
              return checked
                ? field.onChange([...currentValue, OTHER_VALUE])
                : field.onChange(currentValue?.filter((v: string) => v !== OTHER_VALUE));
            }}
            className="sr-only"
          />
        </FormControl>
        <Label
          htmlFor={`${fieldIdPrefix}-${OTHER_VALUE}`}
          className={cn(
            "flex w-full items-center justify-center rounded-md border-2 bg-popover p-4 cursor-pointer font-medium h-full",
            "transition-all duration-150 ease-in-out",
            "hover:border-primary hover:bg-primary/10 hover:text-primary hover:ring-2 hover:ring-primary",
            field.value?.includes(OTHER_VALUE)
              ? "border-primary bg-primary/10 text-primary ring-2 ring-primary"
              : "border-muted"
          )}
        >
          {field.value?.includes(OTHER_VALUE) && <Check className="mr-2 h-5 w-5 text-primary shrink-0" />}
          Other
        </Label>
      </FormItem>
    </div>
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
                  <form onSubmit={form.handleSubmit(handleGenerateFirstQuestion)} className="space-y-8">
                    {/* Role Selection */}
                    <FormField
                      control={form.control}
                      name="roleSelection"
                      render={({ field }) => (
                        <FormItem className="space-y-3">
                          <FormLabel className="text-lg flex items-center"><Briefcase className="mr-2 h-5 w-5 text-muted-foreground" /> Your Desired Role</FormLabel>
                          <FormControl>
                            <>
                              {renderRadioOptions(field, ROLES, "role")}
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
                              {renderRadioOptions(field, INDUSTRIES, "industry")}
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
                      name="focusSelections"
                      render={({ field }) => (
                        <FormItem className="space-y-3">
                          <FormLabel className="text-lg flex items-center"><TrendingUp className="mr-2 h-5 w-5 text-muted-foreground" /> Interview Focus (select all that apply)</FormLabel>
                          <FormControl>
                            <>
                              {renderCheckboxOptions(field, FOCUS_AREAS, "focus")}
                            </>
                          </FormControl>
                           <FormDescription>Select the primary area(s) the interview question should target.</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    {watchedFocusSelections?.includes(OTHER_VALUE) && (
                      <FormField
                        control={form.control}
                        name="customFocus"
                        render={({ field }) => (
                          <FormItem className="animate-in fade-in-0 duration-300">
                            <FormLabel className="text-base">Specify Other Focus Area</FormLabel>
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

          {currentStep === "question_generated" && (
            <div className="space-y-8 animate-in fade-in-0 duration-500">
              <Card className="shadow-lg">
                <CardHeader>
                  <CardTitle className="text-2xl flex items-center">
                    <Lightbulb className="mr-3 h-7 w-7 text-primary" />
                    {isLoadingQuestion ? "Generating next question..." : "Your Interview Question:"}
                  </CardTitle>
                   {currentQuestionParams && !isLoadingQuestion && (
                    <CardDescription className="text-sm">
                      For Role: <span className="font-semibold text-primary">{currentQuestionParams.role}</span> <br/>
                      In Industry: <span className="font-semibold text-primary">{currentQuestionParams.industry}</span> <br/>
                      Focusing on: <span className="font-semibold text-primary">{currentQuestionParams.interviewFocus.join(', ')}</span>
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent>
                 {isLoadingQuestion ? (
                    <Skeleton className="h-24 w-full" />
                  ) : generatedQuestion ? (
                    <p className="text-xl leading-relaxed">{generatedQuestion.question}</p>
                  ) : (
                    <p className="text-xl leading-relaxed text-muted-foreground">Waiting for question...</p>
                  )}
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
                        // textBeforeRecordingRef.current = e.target.value; // Managed by toggleRecording now
                      }
                    }}
                    rows={8}
                    className="text-base leading-relaxed mb-4"
                    aria-label="Your answer"
                    readOnly={isRecording || isLoadingQuestion}
                    disabled={isLoadingQuestion}
                  />
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col sm:flex-row gap-4">
                        <Button onClick={toggleRecording} variant={isRecording ? "destructive" : "outline"} className="flex-1 text-base py-3" disabled={isLoadingQuestion || isLoadingFeedback}>
                        <Mic className="mr-2 h-5 w-5" /> {isRecording ? "Stop Recording" : "Record with Voice"}
                        </Button>
                        <Button onClick={handleNextQuestion} disabled={isLoadingQuestion || isLoadingFeedback || isRecording} className="flex-1 text-base py-3">
                        {isLoadingQuestion ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <CornerDownRight className="mr-2 h-5 w-5" />}
                        Next Question
                        </Button>
                    </div>
                    <Button onClick={handleEndInterviewAndGetFeedback} disabled={isLoadingFeedback || isRecording || isLoadingQuestion} className="w-full text-base py-3">
                      {isLoadingFeedback ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Send className="mr-2 h-5 w-5" />}
                      End Interview & Get Feedback
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {isLoadingFeedback && currentStep === "question_generated" && ( // For overall feedback loading
            <Card className="shadow-lg">
              <CardHeader>
                 <Skeleton className="h-8 w-1/2" />
              </CardHeader>
              <CardContent className="space-y-4">
                <Skeleton className="h-6 w-full mb-2" />
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-6 w-full mt-4 mb-2" />
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          )}


          {currentStep === "overall_feedback_generated" && feedback && (
            <div className="space-y-8 animate-in fade-in-0 duration-500">
                <Card className="shadow-lg">
                    <CardHeader>
                        <CardTitle className="text-2xl flex items-center"><Sparkles className="mr-3 h-7 w-7 text-accent" />Overall Interview Summary</CardTitle>
                        <CardDescription>A high-level overview of your performance.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <p className="text-base leading-relaxed">{feedback.overallSummary || "No overall summary provided."}</p>
                    </CardContent>
                </Card>

                <Card className="shadow-lg">
                    <CardHeader>
                        <CardTitle className="text-2xl flex items-center"><ListChecks className="mr-3 h-7 w-7 text-primary" />Detailed Feedback Per Question</CardTitle>
                        <CardDescription>Review the analysis for each of your answers.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {interviewRounds.length > 0 && feedback.individualFeedbacks && feedback.individualFeedbacks.length === interviewRounds.length ? (
                        <Accordion type="multiple" className="w-full space-y-4">
                            {interviewRounds.map((round, index) => {
                                const roundFeedback = feedback.individualFeedbacks[index];
                                return (
                                <AccordionItem value={`item-${index + 1}`} key={index} className="border border-border rounded-lg shadow-sm overflow-hidden">
                                    <AccordionTrigger className="text-lg hover:no-underline bg-muted/50 px-6 py-4">
                                        <div className="flex items-center">
                                            <span className="text-primary font-semibold mr-2">Q{index + 1}:</span>
                                            <span className="truncate w-64 sm:w-auto">{round.question.question.substring(0,50)}{round.question.question.length > 50 ? "..." : ""}</span>
                                        </div>
                                    </AccordionTrigger>
                                    <AccordionContent className="p-6 space-y-4">
                                        <div>
                                            <h4 className="font-semibold text-md mb-1">Your Answer:</h4>
                                            <p className="text-base leading-relaxed bg-secondary/30 p-3 rounded-md whitespace-pre-wrap">{round.answer || <span className="italic text-muted-foreground">No answer recorded.</span>}</p>
                                        </div>
                                        {roundFeedback ? (
                                            <Accordion type="single" collapsible defaultValue="subitem-overall" className="w-full border-t pt-4">
                                            <AccordionItem value="subitem-overall" className="border-b-0">
                                                <AccordionTrigger className="text-md hover:no-underline py-3">
                                                {renderFeedbackIcon(roundFeedback.overallFeedback?.score, 'overall')}
                                                Overall Feedback
                                                </AccordionTrigger>
                                                <AccordionContent className="text-sm leading-relaxed p-1">
                                                {roundFeedback.overallFeedback?.text} (Score: <span className={cn("font-bold", getScoreColor(roundFeedback.overallFeedback?.score))}>{roundFeedback.overallFeedback?.score}</span>/5)
                                                </AccordionContent>
                                            </AccordionItem>
                                            <AccordionItem value="subitem-clarity" className="border-b-0">
                                                <AccordionTrigger className="text-md hover:no-underline py-3">
                                                {renderFeedbackIcon(roundFeedback.clarity?.score, 'clarity')}
                                                Clarity
                                                </AccordionTrigger>
                                                <AccordionContent className="text-sm leading-relaxed p-1">
                                                {roundFeedback.clarity?.text} (Score: <span className={cn("font-bold", getScoreColor(roundFeedback.clarity?.score))}>{roundFeedback.clarity?.score}</span>/5)
                                                </AccordionContent>
                                            </AccordionItem>
                                            <AccordionItem value="subitem-completeness" className="border-b-0">
                                                <AccordionTrigger className="text-md hover:no-underline py-3">
                                                {renderFeedbackIcon(roundFeedback.completeness?.score, 'completeness')}
                                                Completeness
                                                </AccordionTrigger>
                                                <AccordionContent className="text-sm leading-relaxed p-1">
                                                {roundFeedback.completeness?.text} (Score: <span className={cn("font-bold", getScoreColor(roundFeedback.completeness?.score))}>{roundFeedback.completeness?.score}</span>/5)
                                                </AccordionContent>
                                            </AccordionItem>
                                            <AccordionItem value="subitem-relevance" className="border-b-0">
                                                <AccordionTrigger className="text-md hover:no-underline py-3">
                                                {renderFeedbackIcon(roundFeedback.relevance?.score, 'relevance')}
                                                Relevance
                                                </AccordionTrigger>
                                                <AccordionContent className="text-sm leading-relaxed p-1">
                                                {roundFeedback.relevance?.text} (Score: <span className={cn("font-bold", getScoreColor(roundFeedback.relevance?.score))}>{roundFeedback.relevance?.score}</span>/5)
                                                </AccordionContent>
                                            </AccordionItem>
                                            </Accordion>
                                        ) : (
                                            <p className="italic text-muted-foreground">Feedback for this answer is not available.</p>
                                        )}
                                    </AccordionContent>
                                </AccordionItem>
                                );
                            })}
                        </Accordion>
                        ) : (
                             <p className="italic text-muted-foreground">No individual feedback available. Ensure questions were answered.</p>
                        )}
                    </CardContent>
                </Card>

              <CardFooter>
                <Button onClick={handleStartOver} className="w-full text-lg py-6">
                  <RefreshCw className="mr-2 h-5 w-5" /> Practice Again
                </Button>
              </CardFooter>
            </div>
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
