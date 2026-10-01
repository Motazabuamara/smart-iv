# pip install google-genai        |        set GOOGLE_API_KEY env var first
import wave, os
from google import genai
from google.genai import types

MODEL = "gemini-3.8-flash-tts"   # per project spec; if your key rejects it, use "gemini-2.5-flash-preview-tts"
VOICE = "Algenib"

STYLE = ("Read this in a calm, professional, confident tone for a technology product presentation. "
         "Clear pronunciation, natural steady pacing, brief pauses at punctuation.\n\n")

SCRIPT = [
 ("01", "Every IV drip needs constant attention. Smart IV monitors IV fluids in real time — and keeps patients connected to their nurses. Smart IV — by AI Health Tech — for the Arab Artificial Intelligence Olympiad 2026."),
 ("02", "In many hospitals, IV bags are still checked by hand. A nurse has to walk from bed to bed, and check every level. When many patients need care at the same time, a bag can run low — or run out — without anyone noticing. Smart IV was built to change that."),
 ("03", "Here is how the hardware works. A load cell sits under the IV bag, and measures its weight. The HX711 amplifier turns that signal into precise readings. The ESP8266 processes the data, and sends it over Wi-Fi to the Smart IV server. A relay and a buzzer add local safety alerts on the stand itself."),
 ("04", "Every reading appears instantly on the nurse dashboard. For each patient, the nurse can see the bed, the IV fluid, the total volume, and how much remains. A live progress bar shows the level at a glance. And the status updates in real time, as new data arrives from the hardware."),
 ("05", "Smart IV also includes a built-in AI assistant. The nurse can ask a question — for example: how is the fluid level for bed three? The assistant uses the current system data, and answers in plain language. It understands the context of each patient, right inside the dashboard."),
 ("06", "The system also estimates how long the infusion will last. It takes continuous sensor readings, filters them, and calculates the consumption rate. From the remaining fluid, it estimates the time left before the bag runs out. Intelligent estimation — from real sensor data."),
 ("07", "At the bedside, the patient has a clear view too. On the Smart IV stand, the patient can see their information, the IV status, the remaining fluid, and the estimated time left. Always live. Always up to date."),
 ("08", "And communication is direct. The patient can send a message — or press one button: request nurse. The request travels through the server in real time, and appears instantly on the nurse dashboard."),
 ("09", "Security is built in. Users sign in, verify with a one-time password, and reach their dashboard. Admins manage users and activity in a dedicated panel."),
 ("10", "Smart IV. Real-time monitoring. Direct communication. Intelligent insights — for safer care."),
]

def save_wav(path, pcm, rate=24000):
    with wave.open(path, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate)
        w.writeframes(pcm)

client = genai.Client()  # reads GOOGLE_API_KEY
os.makedirs("vo", exist_ok=True)

for name, text in SCRIPT:
    r = client.models.generate_content(
        model=MODEL,
        contents=STYLE + text,
        config=types.GenerateContentConfig(
            response_modalities=["AUDIO"],
            speech_config=types.SpeechConfig(
                voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=VOICE)))),
    )
    pcm = r.candidates[0].content.parts[0].inline_data.data
    save_wav(f"vo/{name}.wav", pcm)
    print(f"vo/{name}.wav written ({len(pcm)/48000:.1f}s @24kHz)")