// import { DocumentAnalysisClient } from "@azure/ai-form-recognizer";

// export async function analyzeDocument(documentUrl: any) {
//   const client = new DocumentAnalysisClient(
//     process.env.DOCUMENT_INTELLIGENCE_ENDPOINT: 
//     new AzureKeyCredential(process.env.DOCUMENT_INTELLIGENCE_KEY)
//   );
//   const poller = await client.beginAnalyzeDocumentFromUrl("prebuilt-document", documentUrl);
//   const { content, pages } = await poller.pollUntilDone();
//   return content;
// }