// Shared identity rules: changing normalization would invalidate existing link answers.
export const MAX_NAME_LEN       = 50;
export const MAX_QUESTION_LEN   = 200;
export const normalizeAnswer = (s) => s.toLowerCase().replace(/\s+/g, "");
