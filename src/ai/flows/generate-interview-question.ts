
// use server'
'use server';
/**
 * @fileOverview Generates an interview question based on the desired role, industry, and interview focus areas.
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
  interviewFocus: z.array(z.string()).describe('The specific areas the interview should focus on (e.g., Technical Skills, Problem Solving).'),
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

  Generate an interview question for a candidate applying for the role of "{{role}}" in the "{{industry}}" industry.
  The question should be challenging and highly relevant to the specified role and industry.
  {{#if interviewFocus.length}}
  It should specifically assess the candidate's capabilities and depth of knowledge in the following focus area(s):
  {{#each interviewFocus}}
  - {{{this}}}
  {{/each}}
  When multiple focus areas are provided, try to craft a question that can touch upon several of them if possible, or pick the most prominent one if a single question cannot cover all.
  {{else}}
  The question should assess general suitability for the role.
  {{/if}}
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
      const focusText = input.interviewFocus && input.interviewFocus.length > 0 ? input.interviewFocus.join(', ') : 'general suitability';
      return { question: `Tell me about a challenging project you worked on related to ${input.role} focusing on ${focusText}.` };
    }
    return output;
  }
);

