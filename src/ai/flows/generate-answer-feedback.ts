'use server';

/**
 * @fileOverview Generates feedback on a recorded interview answer.
 *
 * - generateAnswerFeedback - A function that generates feedback on an interview answer.
 * - GenerateAnswerFeedbackInput - The input type for the generateAnswerFeedback function.
 * - GenerateAnswerFeedbackOutput - The return type for the generateAnswerFeedback function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GenerateAnswerFeedbackInputSchema = z.object({
  question: z.string().describe('The interview question that was asked.'),
  answer: z.string().describe('The recorded answer to the interview question.'),
  role: z.string().describe('The role the candidate is interviewing for.'),
  industry: z.string().describe('The industry the candidate is interviewing in.'),
});
export type GenerateAnswerFeedbackInput = z.infer<
  typeof GenerateAnswerFeedbackInputSchema
>;

const GenerateAnswerFeedbackOutputSchema = z.object({
  feedback: z.string().describe('Feedback on the recorded answer.'),
  clarity: z.string().describe('Feedback on the clarity of the answer.'),
  completeness: z.string().describe('Feedback on the completeness of the answer.'),
  relevance: z.string().describe('Feedback on the relevance of the answer.'),
});
export type GenerateAnswerFeedbackOutput = z.infer<
  typeof GenerateAnswerFeedbackOutputSchema
>;

export async function generateAnswerFeedback(
  input: GenerateAnswerFeedbackInput
): Promise<GenerateAnswerFeedbackOutput> {
  return generateAnswerFeedbackFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateAnswerFeedbackPrompt',
  input: {schema: GenerateAnswerFeedbackInputSchema},
  output: {schema: GenerateAnswerFeedbackOutputSchema},
  prompt: `You are an expert interview coach providing feedback to candidates.

  The candidate is interviewing for the role of {{role}} in the {{industry}} industry.

  Provide feedback on the following answer to the question, focusing on clarity, completeness, and relevance.

  Question: {{question}}
  Answer: {{answer}}

  Your feedback should be structured as follows:

  - Overall Feedback: [Overall feedback on the answer]
  - Clarity: [Feedback on the clarity of the answer]
  - Completeness: [Feedback on the completeness of the answer]
  - Relevance: [Feedback on the relevance of the answer]

  Please provide actionable insights and suggestions for improvement.
  `,
});

const generateAnswerFeedbackFlow = ai.defineFlow(
  {
    name: 'generateAnswerFeedbackFlow',
    inputSchema: GenerateAnswerFeedbackInputSchema,
    outputSchema: GenerateAnswerFeedbackOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
