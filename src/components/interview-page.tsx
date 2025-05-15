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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AppLogo } from "@/components/icons";
import { Briefcase, Building2, Mic, Send, RefreshCw, Loader2, CheckCircle, Info, Lightbulb, MessageSquare, ThumbsUp, Brain, Target } from "lucide-react";
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

  const { toast } = useToast();

  const form = useForm<z.infer<typeof roleIndustrySchema>>({
    resolver: zodResolver(roleIndustrySchema),
    defaultValues: { role: "", industry: "" },
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognitionAPI) {
        speechRecognitionRef.current = new SpeechRecognitionAPI();
        const recognition = speechRecognitionRef.current;
        recognition.continuous = true; // Keep listening
        recognition.lang = 'en-US';
        recognition.interimResults = true; // Get interim results

        recognition.onresult = (event: any) => {
          let interimTranscript = '';
          let finalTranscript = '';
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              finalTranscript += event.results[i][0].transcript;
            } else {
              interimTranscript += event.results[i][0].transcript;
            }
          }
          setAnswer(prev => prev.substring(0, prev.length - interimTranscript.length) + finalTranscript + interimTranscript);
        };
        
        recognition.onerror = (event: any) => {
          console.error("Speech recognition error", event.error);
          toast({
            title: "Speech Recognition Error",
            description: event.error === 'no-speech' ? "No speech detected. Please try again." : "An error occurred during speech recognition.",
            variant: "destructive",
          });
          setIsRecording(false);
        };
        recognition.onend = () => {
          // Only set isRecording to false if it was intentionally stopped or an error occurred.
          // If continuous is true, it might restart automatically or need manual restart.
          // For this setup, we'll assume onend means it stopped.
          if (isRecording) { // Check if it was supposed to be recording
            setIsRecording(false); 
          }
        };
      } else {
        console.warn("Speech Recognition API not supported in this browser.");
      }
    }
  }, [toast, isRecording]);


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
        description: "Failed to generate feedback. Please try again.",
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
      setIsRecording(false);
    } else {
      try {
        speechRecognitionRef.current.start();
        setIsRecording(true);
         if (!isStopwatchRunning) startStopwatch(); // Start stopwatch if not already running
      } catch (e) {
        console.error("Error starting speech recognition:", e);
        toast({
            title: "Speech Recognition Error",
            description: "Could not start speech recognition. Please check microphone permissions.",
            variant: "destructive",
        });
        setIsRecording(false);
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
    if (isRecording && speechRecognitionRef.current) {
      speechRecognitionRef.current.stop();
      setIsRecording(false);
    }
  };

  // Cleanup stopwatch on unmount
  useEffect(() => {
    return () => {
      if (stopwatchIntervalRef.current) {
        clearInterval(stopwatchIntervalRef.current);
      }
      if (speechRecognitionRef.current && isRecording) {
        speechRecognitionRef.current.stop();
      }
    };
  }, [isRecording]);

  return (
    <div className="flex flex-col min-h-screen">
      <header className="py-6 px-4 md:px-8 border-b">
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
                    onChange={(e) => setAnswer(e.target.value)}
                    rows={8}
                    className="text-base leading-relaxed mb-4"
                    aria-label="Your answer"
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
                      <ThumbsUp className="mr-2 h-5 w-5 text-accent" /> Overall Feedback
                    </AccordionTrigger>
                    <AccordionContent className="text-base leading-relaxed p-1">
                      {feedback.feedback}
                    </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="item-2">
                    <AccordionTrigger className="text-xl hover:no-underline">
                       <Brain className="mr-2 h-5 w-5 text-primary" /> Clarity
                    </AccordionTrigger>
                    <AccordionContent className="text-base leading-relaxed p-1">
                       {feedback.clarity}
                    </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="item-3">
                    <AccordionTrigger className="text-xl hover:no-underline">
                       <Info className="mr-2 h-5 w-5 text-primary" /> Completeness
                    </AccordionTrigger>
                    <AccordionContent className="text-base leading-relaxed p-1">
                       {feedback.completeness}
                    </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="item-4">
                    <AccordionTrigger className="text-xl hover:no-underline">
                       <Target className="mr-2 h-5 w-5 text-primary" /> Relevance
                    </AccordionTrigger>
                    <AccordionContent className="text-base leading-relaxed p-1">
                       {feedback.relevance}
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

      <footer className="py-6 px-4 md:px-8 border-t mt-auto">
        <div className="container mx-auto text-center text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} AceInterview. Powered by AI.</p>
        </div>
      </footer>
    </div>
  );
}
