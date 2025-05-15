
'use server';
/**
 * @fileOverview Generates overall interview feedback, including individual feedback for each question and a summary.
 *
 * - generateOverallInterviewFeedback - A function that generates comprehensive interview feedback.
 * - GenerateOverallInterviewFeedbackInput - The input type for the function.
 * - GenerateOverallInterviewFeedbackOutput - The return type for the function.
 * - IndividualFeedback - The type for feedback on a single question.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import type { GenerateAnswerFeedbackOutput as IndividualFeedbackType } from './generate-answer-feedback'; // Re-exporting for convenience
export type { IndividualFeedbackType as IndividualFeedback };


// Re-using the schema for individual feedback from the other flow
const FeedbackItemSchema = z.object({
  text: z.string().describe('The textual feedback for this category.'),
  score: z.number().min(1).max(5).describe('A numerical score from 1 (poor) to 5 (excellent) for this category.'),
});

const IndividualFeedbackSchema = z.object({
  overallFeedback: FeedbackItemSchema.describe('Overall feedback and score on the answer to this specific question.'),
  clarity: FeedbackItemSchema.describe('Feedback and score on the clarity of this answer.'),
  completeness: FeedbackItemSchema.describe('Feedback and score on the completeness of this answer.'),
  relevance: FeedbackItemSchema.describe('Feedback and score on the relevance of this answer.'),
});


const GenerateOverallInterviewFeedbackInputSchema = z.object({
  role: z.string().describe('The role the candidate is interviewing for.'),
  industry: z.string().describe('The industry the candidate is interviewing in.'),
  interviewRounds: z.array(
    z.object({
      questionText: z.string().describe('The interview question that was asked.'),
      answerText: z.string().describe('The recorded answer to the interview question.'),
    })
  ).describe('An array of question and answer pairs from the interview session.'),
});
export type GenerateOverallInterviewFeedbackInput = z.infer<typeof GenerateOverallInterviewFeedbackInputSchema>;


const GenerateOverallInterviewFeedbackOutputSchema = z.object({
  individualFeedbacks: z.array(IndividualFeedbackSchema).describe('An array of feedback objects, one for each question-answer pair.'),
  overallSummary: z.string().describe("A concise summary of the candidate's overall performance across all questions, highlighting strengths and areas for improvement."),
});
export type GenerateOverallInterviewFeedbackOutput = z.infer<typeof GenerateOverallInterviewFeedbackOutputSchema>;


export async function generateOverallInterviewFeedback(
  input: GenerateOverallInterviewFeedbackInput
): Promise<GenerateOverallInterviewFeedbackOutput> {
  return generateOverallInterviewFeedbackFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateOverallInterviewFeedbackPrompt',
  input: {schema: GenerateOverallInterviewFeedbackInputSchema},
  output: {schema: GenerateOverallInterviewFeedbackOutputSchema},
  prompt: `You are an expert interview coach providing comprehensive feedback to a candidate after a mock interview session.

The candidate is interviewing for the role of "{{role}}" in the "{{industry}}" industry.

You will be provided with a series of questions asked and the candidate's answers.
For EACH question-answer pair, you MUST provide:
1. Detailed textual feedback with actionable insights and suggestions for improvement for "Overall Feedback", "Clarity", "Completeness", and "Relevance".
2. A numerical score from 1 (poor) to 5 (excellent) for each of these four categories.

After evaluating all individual question-answer pairs, provide an "overallSummary" of the candidate's performance across the entire interview. This summary should highlight general strengths, consistent weaknesses, and actionable advice for improvement.

The interview rounds are as follows:
{{#each interviewRounds}}
Question {{add @index 1}}: {{this.questionText}}
Answer {{add @index 1}}: {{this.answerText}}
---
{{/each}}

Your output MUST strictly follow this JSON structure. Ensure scores are integers between 1 and 5:
{
  "individualFeedbacks": [
    { // Feedback for Question 1
      "overallFeedback": { "text": "Detailed overall feedback for Q1...", "score": <integer_1_to_5> },
      "clarity": { "text": "Detailed clarity feedback for Q1...", "score": <integer_1_to_5> },
      "completeness": { "text": "Detailed completeness feedback for Q1...", "score": <integer_1_to_5> },
      "relevance": { "text": "Detailed relevance feedback for Q1...", "score": <integer_1_to_5> }
    },
    { // Feedback for Question 2 (if applicable)
      "overallFeedback": { "text": "Detailed overall feedback for Q2...", "score": <integer_1_to_5> },
      "clarity": { "text": "Detailed clarity feedback for Q2...", "score": <integer_1_to_5> },
      "completeness": { "text": "Detailed completeness feedback for Q2...", "score": <integer_1_to_5> },
      "relevance": { "text": "Detailed relevance feedback for Q2...", "score": <integer_1_to_5> }
    }
    // ... more feedback objects if more questions
  ],
  "overallSummary": "Your comprehensive summary of the entire interview performance..."
}

Example for one question's feedback within the array:
{
  "overallFeedback": { "text": "This was a strong and well-structured answer to the first question. You clearly understood the question and provided a comprehensive response.", "score": 5 },
  "clarity": { "text": "The answer was articulated very clearly. Your points were easy to follow.", "score": 5 },
  "completeness": { "text": "You covered all the key aspects expected for this question.", "score": 4 },
  "relevance": { "text": "Your answer was highly relevant to the question asked.", "score": 5 }
}

If no questions were answered or provided, the "individualFeedbacks" array can be empty, and the "overallSummary" should reflect that no assessment could be made.
If an answer is very short or non-existent, provide feedback on that (e.g., "The answer was too brief to assess completeness.").
`,
  // Helper for Handlebars to get 1-based index
  helpers: {
    add: (a: any, b: any) => a + b,
  }
});

const generateOverallInterviewFeedbackFlow = ai.defineFlow(
  {
    name: 'generateOverallInterviewFeedbackFlow',
    inputSchema: GenerateOverallInterviewFeedbackInputSchema,
    outputSchema: GenerateOverallInterviewFeedbackOutputSchema,
  },
  async (input: GenerateOverallInterviewFeedbackInput) => {
    if (!input.interviewRounds || input.interviewRounds.length === 0) {
      // Handle case with no interview rounds, maybe return a default structure
      // or throw an error if the prompt isn't expected to handle it.
      // For now, let the prompt try to handle it.
    }
    const {output} = await prompt(input);
    if (!output) {
      throw new Error('AI failed to generate overall feedback in the expected format.');
    }
    // Ensure individualFeedbacks is an array, even if AI returns it as null/undefined for no rounds
    if (!output.individualFeedbacks) {
        output.individualFeedbacks = [];
    }
    return output;
  }
);
