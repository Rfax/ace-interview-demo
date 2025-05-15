
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
  const textBeforeRecordingRef = useRef<string>(""); // Stores text before current recording session
  
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
      } else if (!SpeechRecognitionAPI) {
        console.warn("Speech Recognition API not supported in this browser.");
        toast({
          title: "Unsupported Feature",
          description: "Speech recognition is not available in your browser.",
          variant: "destructive",
        });
      }
    }
  }, [toast]);

  useEffect(() => {
    if (!speechRecognitionRef.current) return;

    const recognition = speechRecognitionRef.current;

    recognition.onresult = (event: any) => {
      let sessionFinalTranscript = "";
      let currentInterimTranscript = "";

      for (let i = 0; i < event.results.length; ++i) {
        const transcriptSegment = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          sessionFinalTranscript += transcriptSegment + " ";
        } else {
          currentInterimTranscript = transcriptSegment; // Keep updating with the latest interim
        }
      }
      sessionFinalTranscript = sessionFinalTranscript.trim();
      
      let newSpokenText = sessionFinalTranscript;
      if (currentInterimTranscript) {
        if (newSpokenText) newSpokenText += " ";
        newSpokenText += currentInterimTranscript;
      }

      let combinedAnswer = textBeforeRecordingRef.current;
      if (newSpokenText) {
        if (combinedAnswer && !combinedAnswer.endsWith(" ")) {
          combinedAnswer += " ";
        }
        combinedAnswer += newSpokenText;
      }
      setAnswer(combinedAnswer);
    };
    
    recognition.onerror = (event: any) => {
      console.error("Speech recognition error", event.error);
      toast({
        title: "Speech Recognition Error",
        description: event.error === 'no-speech' ? "No speech detected. Please try again." : "An error occurred during speech recognition.",
        variant: "destructive",
      });
      if(isRecording) setIsRecording(false); // Ensure recording state is reset
    };

    recognition.onend = () => {
      // This onend can be triggered by .stop() or naturally.
      // We only want to set isRecording to false if it was programmatically stopped OR if it's still true.
      if (isRecording) { 
        setIsRecording(false); 
      }
    };
  }, [isRecording, toast]); // isRecording dependency is important here if onend behavior relies on it


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
      speechRecognitionRef.current.stop(); // This will trigger onend, which sets isRecording to false.
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
      speechRecognitionRef.current.stop(); // This will trigger onend, which sets isRecording to false.
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
    } catch (error)
{
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
      // onend will set isRecording to false
    } else {
      try {
        // Capture text just before starting a new recording session.
        // This ensures that if the user types then records, the typed text is preserved.
        textBeforeRecordingRef.current = answer; 
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
        setIsRecording(false); // Ensure state is reset if start fails
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
    }
    // isRecording will be set to false by the onend handler
  };

  useEffect(() => {
    // Cleanup function
    return () => {
      if (stopwatchIntervalRef.current) {
        clearInterval(stopwatchIntervalRef.current);
      }
      // Stop recognition if active and component unmounts
      if (speechRecognitionRef.current && isRecording) {
         speechRecognitionRef.current.stop();
      }
      // Nullify handlers to prevent calls on unmounted component, though usually not needed with modern React
      if (speechRecognitionRef.current) {
        speechRecognitionRef.current.onresult = null;
        speechRecognitionRef.current.onerror = null;
        speechRecognitionRef.current.onend = null;
      }
    };
  }, [isRecording]); // Add isRecording to dependencies to ensure cleanup is correct if it changes

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
                    onChange={(e) => {
                      // Allow typing only if not currently recording
                      if (!isRecording) { 
                        setAnswer(e.target.value);
                        // If user types, this becomes the new baseline for subsequent recordings
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
                      <ThumbsUp className="mr-2 h-5 w-5 text-green-600" /> Overall Feedback
                    </AccordionTrigger>
                    <AccordionContent className="text-base leading-relaxed p-1">
                      {feedback.feedback}
                    </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="item-2">
                    <AccordionTrigger className="text-xl hover:no-underline">
                       <Brain className="mr-2 h-5 w-5 text-yellow-500" /> Clarity
                    </AccordionTrigger>
                    <AccordionContent className="text-base leading-relaxed p-1">
                       {feedback.clarity}
                    </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="item-3">
                    <AccordionTrigger className="text-xl hover:no-underline">
                       <Info className="mr-2 h-5 w-5 text-orange-500" /> Completeness
                    </AccordionTrigger>
                    <AccordionContent className="text-base leading-relaxed p-1">
                       {feedback.completeness}
                    </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="item-4">
                    <AccordionTrigger className="text-xl hover:no-underline">
                       <Target className="mr-2 h-5 w-5 text-lime-500" /> Relevance
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

