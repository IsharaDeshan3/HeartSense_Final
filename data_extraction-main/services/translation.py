import google.generativeai as genai
from google.cloud import translate_v2 as translate
import os

class TranslationService:
    def __init__(self):
        self.client = None
        try:
            self.client = translate.Client()
            print("✓ Google Cloud Translate initialized")
        except Exception as e:
            print(f"! Google Cloud Translate unavailable: {e}. Falling back to Gemini.")
            api_key = os.getenv("GEMINI_API_KEY")
            if api_key:
                genai.configure(api_key=api_key)
                self.model = genai.GenerativeModel('gemini-1.5-flash')
            else:
                print("!! Critical: No GEMINI_API_KEY found for fallback.")

    def translate_text(self, text: str, target_lang: str = "en"):
        if not text.strip():
            return ""

        # Try Google Cloud Translate first
        if self.client:
            try:
                result = self.client.translate(text, target_language=target_lang, format_="text")
                return result["translatedText"]
            except Exception as e:
                print(f"Google Translate failed at runtime: {e}")

        # Fallback to Gemini
        try:
            prompt = f"Translate the following clinical text to {target_lang}. Return ONLY the translated text.\n\nText: {text}"
            response = self.model.generate_content(prompt)
            return response.text.strip()
        except Exception as e:
            print(f"Gemini Translation failed: {e}")
            return text # Return original if all fails
