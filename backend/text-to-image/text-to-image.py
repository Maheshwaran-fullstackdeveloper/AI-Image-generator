import os, random, tempfile, uuid

import modal
from pydantic import BaseModel

app = modal.App("ai-image-generator-backend")

# Turbo-only
MODEL_ID = "Tongyi-MAI/Z-Image-Turbo"
MONGO_SECRET = modal.Secret.from_name("ai-image-generator-mongodb-secret")
SECRETS = [MONGO_SECRET]
VOL = modal.Volume.from_name(os.getenv("MODAL_HF_CACHE_VOLUME_NAME", "hf-hub-cache"), create_if_missing=True)

image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("git")
    .pip_install_from_requirements("requirements.txt")
    .env({"HF_XET_HIGH_PERFORMANCE": "1", "HF_HUB_CACHE": "/models"})
)


class Req(BaseModel):
    prompt: str
    userId: str
    negative_prompt: str | None = None
    width: int = 1024
    height: int = 1024
    num_inference_steps: int | None = None
    guidance_scale: float | None = None
    seed: int | None = None


@app.cls(
    image=image,
    gpu=os.getenv("MODAL_GPU", "A10G"),
    timeout=300,
    scaledown_window=60,
    volumes={"/models": VOL},
    secrets=SECRETS,
)
class ZImageServer:
    @modal.enter()
    def load(self):
        import torch
        from diffusers import ZImagePipeline

        self.t, self.P = torch, ZImagePipeline
        self.token = (os.getenv("HF_TOKEN") or os.getenv("HUGGINGFACE_HUB_TOKEN") or "").strip().strip("\"'") or None
        self.pipe = None

        self.pipe = self.P.from_pretrained(
            MODEL_ID,
            torch_dtype=self.t.bfloat16,
            low_cpu_mem_usage=False,
            token=self.token,
        ).to("cuda")

    @modal.fastapi_endpoint(path="/", method="POST", docs=True)
    def generate_image(self, r: Req):
        from pymongo import MongoClient
        from datetime import datetime
        import base64
        from io import BytesIO

        mongo_url = os.getenv("MONGODB_URL")
        pipe = self.pipe

        seed = int(r.seed) if r.seed is not None else random.randint(0, 2**32 - 1)
        gen = self.t.Generator("cuda").manual_seed(seed)

        steps = int(r.num_inference_steps) if r.num_inference_steps is not None else 9
        scale = float(r.guidance_scale) if r.guidance_scale is not None else 0.0

        img = pipe(
            **{
                "prompt": r.prompt,
                "height": int(r.height),
                "width": int(r.width),
                "num_inference_steps": steps,
                "guidance_scale": scale,
                "generator": gen,
                "negative_prompt": r.negative_prompt,
            }
        ).images[0]

        # Convert image to Base64
        buffered = BytesIO()
        img.save(buffered, format="PNG")
        img_str = base64.b64encode(buffered.getvalue()).decode("utf-8")
        data_url = f"data:image/png;base64,{img_str}"

        # Store in MongoDB
        if mongo_url:
            try:
                client = MongoClient(mongo_url)
                db = client["image_generator"]
                collection = db["images"]
                
                image_data = {
                    "userId": r.userId,
                    "prompt": r.prompt,
                    "imageUrl": data_url, # Now storing the Base64 data URL
                    "seed": seed,
                    "modelId": MODEL_ID,
                    "createdAt": datetime.utcnow(),
                    "metadata": {
                        "width": r.width,
                        "height": r.height,
                        "steps": steps,
                        "guidanceScale": scale,
                    }
                }
                collection.insert_one(image_data)
                print(f"Successfully stored image in MongoDB for user {r.userId}")
            except Exception as e:
                print(f"Error storing in MongoDB: {e}")

        return {"image_url": data_url, "seed": seed, "model_id": MODEL_ID}