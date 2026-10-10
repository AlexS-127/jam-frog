// The exported model is imported as text and parsed at startup, so TypeScript never type-infers the 3.7 MB file.
declare module '*.json?raw' {
  const text: string;
  export default text;
}
