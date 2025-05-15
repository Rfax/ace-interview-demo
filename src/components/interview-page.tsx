
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
import { AppLogo } from "@/components/icons";
import { Briefcase, Building2, Mic, Send, RefreshCw, Loader2, CheckCircle, Info, Lightbulb, MessageSquare, ThumbsUp, Brain, Target, ThumbsDown } from "lucide-react";
import { formatTime } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";

const roleIndustrySchema = z.object({
  role: z.string().min(2, { message: "Role must be at least 2 characters." }).max(50, { message: "Role must be at most 50 characters." }),
  industry: z.string().min(2, { message: "Industry must be at least 2 characters." }).max(50, { message: "Industry must be at most 50 characters." }),
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
  if (score === undefined) return "text-gray-400"; 
  if (score <= 1) return "text-red-500";
  if (score === 2) return "text-orange-500";
  if (score === 3) return "text-yellow-500";
  if (score === 4) return "text-lime-500"; 
  if (score >= 5) return "text-green-600";
  return "text-gray-400";
};

const renderFeedbackIcon = (
  score: number | undefined,
  iconType: 'overall' | 'clarity' | 'completeness' | 'relevance'
) => {
  const color = getScoreColor(score);
  let SpecificIconComponent;

  switch (iconType) {
    case 'overall':
      SpecificIconComponent = (typeof score === 'number' && score <= 2) ? ThumbsDown : ThumbsUp;
      break;
    case 'clarity':
      SpecificIconComponent = Brain;
      break;
    case 'completeness':
      SpecificIconComponent = Info;
      break;
    case 'relevance':
      SpecificIconComponent = Target;
      break;
    default:
      return null; // Should not happen with defined types
  }
  return <SpecificIconComponent className={`mr-2 h-5 w-5 ${color}`} />;
};


export default function InterviewPage() {
  const [currentStep, setCurrentStep] = useState<CurrentStep>("initial");
  const [generatedQuestion, setGeneratedQuestion] = useState<GenerateInterviewQuestionOutput | null>(null);
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
  
  const { toast } = useToast();

  const form = useForm<z.infer<typeof roleIndustrySchema>>({
    resolver: zodResolver(roleIndustrySchema),
    defaultValues: { role: "", industry: "" },
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognitionAPI && !speechRecognitionRef.current) {
        speechRecognitionRef.current = new SpeechRecognitionAPI();
        speechRecognitionRef.current.continuous = true;
        speechRecognitionRef.current.lang = 'en-US';
        speechRecognitionRef.current.interimResults = true;

        speechRecognitionRef.current.onresult = (event: any) => {
          let fullInterimTranscript = '';
          let sessionFinalTranscript = '';
        
          for (let i = 0; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              sessionFinalTranscript += event.results[i][0].transcript + ' ';
            } else {
              fullInterimTranscript += event.results[i][0].transcript;
            }
          }
          
          sessionFinalTranscript = sessionFinalTranscript.trim();
          fullInterimTranscript = fullInterimTranscript.trim();
        
          let newAnswer = textBeforeRecordingRef.current;
          if (sessionFinalTranscript) {
            if (newAnswer && !newAnswer.endsWith(" ")) newAnswer += " ";
            newAnswer += sessionFinalTranscript;
          }
        
          // Append the most current interim transcript if it's different or new
          if (fullInterimTranscript && (!sessionFinalTranscript || !fullInterimTranscript.startsWith(sessionFinalTranscript))) {
             // This logic tries to append only the *newest* part of the interim
            let uniqueInterim = fullInterimTranscript;
            if(sessionFinalTranscript && fullInterimTranscript.includes(sessionFinalTranscript)){
                uniqueInterim = fullInterimTranscript.split(sessionFinalTranscript).pop()?.trim() || "";
            }

            if (uniqueInterim) {
                if (newAnswer && !newAnswer.endsWith(" ") && !uniqueInterim.startsWith(" ")) newAnswer += " ";
                else if (!newAnswer && uniqueInterim.startsWith(" ")) uniqueInterim = uniqueInterim.trimStart();
                newAnswer += uniqueInterim;
            }
          }
          setAnswer(newAnswer);
        };
        
        speechRecognitionRef.current.onerror = (event: any) => {
          console.error("Speech recognition error", event.error);
          toast({
            title: "Speech Recognition Error",
            description: event.error === 'no-speech' ? "No speech detected. Please try again." : "An error occurred during speech recognition.",
            variant: "destructive",
          });
          if(isRecording) setIsRecording(false); // Ensure isRecording state is reset
        };
    
        speechRecognitionRef.current.onend = () => {
           // Final consolidation of text is tricky with continuous interim results.
           // 'onresult' should ideally handle the final text state.
           // We ensure textBeforeRecordingRef is updated with the latest answer from state,
           // in case the recording stops and starts again.
           setAnswer(prevAnswer => {
             textBeforeRecordingRef.current = prevAnswer;
             return prevAnswer;
           });
           
           if (isRecording) { // Only change isRecording if it was active
             setIsRecording(false);
           }
        };

      } else if (!SpeechRecognitionAPI) {
        console.warn("Speech Recognition API not supported in this browser.");
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast]); // Removed isRecording from dependencies to stabilize instance creation. Event handlers can be updated if needed, but instance should be stable.

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

  const handleGenerateQuestion = async (values: z.infer<typeof roleIndustrySchema>) => {
    setIsLoadingQuestion(true);
    setGeneratedQuestion(null);
    setFeedback(null);
    setAnswer("");
    textBeforeRecordingRef.current = ""; 
    if (isRecording && speechRecognitionRef.current) {
      speechRecognitionRef.current.stop(); 
      // setIsRecording(false); // onend will handle this
    }
    try {
      const questionData = await generateInterviewQuestion(values as GenerateInterviewQuestionInput);
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
    if (!generatedQuestion || !form.getValues().role || !form.getValues().industry) return;
    setIsLoadingFeedback(true);
    setFeedback(null);
    stopStopwatch();
    if (isRecording && speechRecognitionRef.current) {
      speechRecognitionRef.current.stop();
      // setIsRecording(false); // onend will handle this
    }
    try {
      const feedbackData = await generateAnswerFeedback({
        question: generatedQuestion.question,
        answer,
        role: form.getValues().role,
        industry: form.getValues().industry,
      } as GenerateAnswerFeedbackInput);
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
      // setIsRecording(false) will be handled by onend
    } else {
      try {
        textBeforeRecordingRef.current = answer; // Capture text just before starting new recording
        speechRecognitionRef.current.start();
        setIsRecording(true); // Set recording state immediately
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
        setIsRecording(false); // Explicitly set to false on error starting
      }
    }
  };

  const handleStartOver = () => {
    form.reset();
    setGeneratedQuestion(null);
    setAnswer("");
    setFeedback(null);
    setCurrentStep("initial");
    setElapsedTime(0);
    stopStopwatch();
    textBeforeRecordingRef.current = "";
    if (isRecording && speechRecognitionRef.current) {
      speechRecognitionRef.current.stop();
      // setIsRecording(false); // onend should handle this
    }
  };

  useEffect(() => {
    // Cleanup interval and speech recognition on component unmount
    return () => {
      if (stopwatchIntervalRef.current) {
        clearInterval(stopwatchIntervalRef.current);
      }
      if (speechRecognitionRef.current) {
         // Check if isRecording is true before stopping, to avoid errors if already stopped
         if(isRecording) speechRecognitionRef.current.stop();
         // Detach handlers to prevent memory leaks or errors after unmount
         speechRecognitionRef.current.onresult = null;
         speechRecognitionRef.current.onerror = null;
         speechRecognitionRef.current.onend = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRecording]); // Add isRecording here to ensure cleanup logic is current if it changes.


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
                <CardDescription>Tell us about the role you're preparing for.</CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(handleGenerateQuestion)} className="space-y-6">
                    <FormField
                      control={form.control}
                      name="role"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-lg">Your Desired Role</FormLabel>
                          <FormControl>
                            <div className="relative flex items-center">
                              <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                              <Input placeholder="e.g., Software Engineer" {...field} className="pl-10 text-base" />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="industry"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-lg">Target Industry</FormLabel>
                          <FormControl>
                            <div className="relative flex items-center">
                              <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                              <Input placeholder="e.g., Tech, Finance, Healthcare" {...field} className="pl-10 text-base" />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
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
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-12 w-full" />
              </CardContent>
            </Card>
          )}

          {currentStep === "question_generated" && generatedQuestion && (
            <div className="space-y-8 animate-in fade-in-0 duration-500">
              <Card className="shadow-lg">
                <CardHeader>
                  <CardTitle className="text-2xl flex items-center"><Lightbulb className="mr-3 h-7 w-7 text-primary" />Your Interview Question:</CardTitle>
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
                      {feedback.overallFeedback ? renderFeedbackIcon(feedback.overallFeedback.score, 'overall') : renderFeedbackIcon(undefined, 'overall')}
                      Overall Feedback
                    </AccordionTrigger>
                    <AccordionContent className="text-base leading-relaxed p-1">
                      {feedback.overallFeedback?.text} (Score: {feedback.overallFeedback?.score}/5)
                    </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="item-2">
                    <AccordionTrigger className="text-xl hover:no-underline">
                       {feedback.clarity ? renderFeedbackIcon(feedback.clarity.score, 'clarity') : renderFeedbackIcon(undefined, 'clarity')}
                       Clarity
                    </AccordionTrigger>
                    <AccordionContent className="text-base leading-relaxed p-1">
                       {feedback.clarity?.text} (Score: {feedback.clarity?.score}/5)
                    </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="item-3">
                    <AccordionTrigger className="text-xl hover:no-underline">
                       {feedback.completeness ? renderFeedbackIcon(feedback.completeness.score, 'completeness') : renderFeedbackIcon(undefined, 'completeness')}
                       Completeness
                    </AccordionTrigger>
                    <AccordionContent className="text-base leading-relaxed p-1">
                       {feedback.completeness?.text} (Score: {feedback.completeness?.score}/5)
                    </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="item-4">
                    <AccordionTrigger className="text-xl hover:no-underline">
                       {feedback.relevance ? renderFeedbackIcon(feedback.relevance.score, 'relevance') : renderFeedbackIcon(undefined, 'relevance')}
                       Relevance
                    </AccordionTrigger>
                    <AccordionContent className="text-base leading-relaxed p-1">
                       {feedback.relevance?.text} (Score: {feedback.relevance?.score}/5)
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

