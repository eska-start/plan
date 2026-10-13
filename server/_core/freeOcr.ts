import { ENV } from "./env";
export {
  parseAccommodationFromText,
  parseFlightFromText,
  parseRentalFromText,
} from "@shared/textParse";

const DEFAULT_OCR_SPACE_FREE_KEY = "helloworld";

type OcrSpaceParsedResult = {
  ParsedText?: string;
};

type OcrSpaceResponse = {
  IsErroredOnProcessing?: boolean;
  ErrorMessage?: string[] | string;
  ParsedResults?: OcrSpaceParsedResult[];
};

export async function extractTextWithFreeOcr(imageUrl: string): Promise<string> {
  const form = new URLSearchParams();
  form.set("url", imageUrl);
  form.set("language", "eng");
  form.set("isOverlayRequired", "false");
  form.set("OCREngine", "2");

  const response = await fetch("https://api.ocr.space/parse/image", {
    method: "POST",
    headers: {
      apikey: ENV.ocrSpaceApiKey || DEFAULT_OCR_SPACE_FREE_KEY,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });

  if (!response.ok) {
    throw new Error(`OCR API failed: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as OcrSpaceResponse;
  if (data.IsErroredOnProcessing) {
    const err = Array.isArray(data.ErrorMessage)
      ? data.ErrorMessage.join(", ")
      : data.ErrorMessage ?? "Unknown OCR error";
    throw new Error(err);
  }

  return (data.ParsedResults ?? [])
    .map(result => result.ParsedText ?? "")
    .join("\n")
    .trim();
}
