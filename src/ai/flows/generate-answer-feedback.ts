
'use server';

/**
 * @fileOverview Generates feedback on a recorded interview answer, including scores.
 *
 * - generateAnswerFeedback - A function that generates feedback and scores on an interview answer.
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

const FeedbackItemSchema = z.object({
  text: z.string().describe('The textual feedback for this category.'),
  score: z.number().min(1).max(5).describe('A numerical score from 1 (poor) to 5 (excellent) for this category.'),
});

const GenerateAnswerFeedbackOutputSchema = z.object({
  overallFeedback: FeedbackItemSchema.describe('Overall feedback and score on the answer.'),
  clarity: FeedbackItemSchema.describe('Feedback and score on the clarity of the answer.'),
  completeness: FeedbackItemSchema.describe('Feedback and score on the completeness of the answer.'),
  relevance: FeedbackItemSchema.describe('Feedback and score on the relevance of the answer.'),
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

  Provide feedback on the following answer to the question. For EACH category (Overall Feedback, Clarity, Completeness, Relevance), you must provide:
  1. Detailed textual feedback with actionable insights and suggestions for improvement.
  2. A numerical score from 1 to 5, where 1 is poor and 5 is excellent.

  Question: {{question}}
  Answer: {{answer}}

  Your output MUST strictly follow this JSON structure. Ensure scores are integers between 1 and 5:
  {
    "overallFeedback": { "text": "Your detailed overall feedback here...", "score": <integer_1_to_5> },
    "clarity": { "text": "Your detailed clarity feedback here...", "score": <integer_1_to_5> },
    "completeness": { "text": "Your detailed completeness feedback here...", "score": <integer_1_to_5> },
    "relevance": { "text": "Your detailed relevance feedback here...", "score": <integer_1_to_5> }
  }

  Example for a strong answer:
  {
    "overallFeedback": { "text": "This was a very strong and well-structured answer. You clearly understood the question and provided a comprehensive response.", "score": 5 },
    "clarity": { "text": "The answer was articulated very clearly. Your points were easy to follow, and your language was precise.", "score": 5 },
    "completeness": { "text": "You covered all the key aspects expected for this question, offering sufficient detail and examples.", "score": 4 },
    "relevance": { "text": "Your answer was highly relevant to the question asked and stayed on topic throughout.", "score": 5 }
  }

  Example for an answer needing improvement:
  {
    "overallFeedback": { "text": "This answer needs significant improvement. It lacked depth and didn't fully address the core of the question.", "score": 1 },
    "clarity": { "text": "The answer was somewhat confusing and difficult to follow. Try to structure your thoughts more logically.", "score": 2 },
    "completeness": { "text": "Several important points were missed. Consider what a comprehensive answer would entail for this type of question.", "score": 1 },
    "relevance": { "text": "The answer strayed from the main topic at times. Ensure your response directly addresses what is being asked.", "score": 2 }
  }
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
    if (!output) {
      throw new Error('AI failed to generate feedback in the expected format.');
    }
    return output;
  }
);

