// use server'
'use server';
/**
 * @fileOverview Generates an interview question based on the desired role, industry, and interview focus.
 *
 * - generateInterviewQuestion - A function that generates an interview question.
 * - GenerateInterviewQuestionInput - The input type for the generateInterviewQuestion function.
 * - GenerateInterviewQuestionOutput - The return type for the generateInterviewQuestion function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GenerateInterviewQuestionInputSchema = z.object({
  role: z.string().describe('The desired role of the user.'),
  industry: z.string().describe('The industry the user is interested in.'),
  interviewFocus: z.string().describe('The specific area the interview should focus on (e.g., Technical Skills, Problem Solving).'),
});
export type GenerateInterviewQuestionInput = z.infer<typeof GenerateInterviewQuestionInputSchema>;

const GenerateInterviewQuestionOutputSchema = z.object({
  question: z.string().describe('The generated interview question.'),
});
export type GenerateInterviewQuestionOutput = z.infer<typeof GenerateInterviewQuestionOutputSchema>;

export async function generateInterviewQuestion(input: GenerateInterviewQuestionInput): Promise<GenerateInterviewQuestionOutput> {
  return generateInterviewQuestionFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateInterviewQuestionPrompt',
  input: {schema: GenerateInterviewQuestionInputSchema},
  output: {schema: GenerateInterviewQuestionOutputSchema},
  prompt: `You are an expert interview question generator.

  Generate an interview question for a candidate applying for the role of "{{role}}" in the "{{industry}}" industry, with a specific focus on "{{interviewFocus}}".
  The question should be challenging and highly relevant to the specified role, industry, and particularly the stated focus area.
  Ensure the question effectively allows the candidate to demonstrate their capabilities and depth of knowledge in the "{{interviewFocus}}" area.
  The question should be open-ended enough to elicit a detailed response.
  Avoid simple yes/no questions or questions that can be answered with a single word or short phrase.
  `,
});

const generateInterviewQuestionFlow = ai.defineFlow(
  {
    name: 'generateInterviewQuestionFlow',
    inputSchema: GenerateInterviewQuestionInputSchema,
    outputSchema: GenerateInterviewQuestionOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    if (!output || !output.question) {
      // Fallback or error handling if AI returns empty/invalid output
      console.warn("AI did not return a valid question, generating a generic one.");
      return { question: `Tell me about a challenging project you worked on related to ${input.role} focusing on ${input.interviewFocus}.` };
    }
    return output;
  }
);
