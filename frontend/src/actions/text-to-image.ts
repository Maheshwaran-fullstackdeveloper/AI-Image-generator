"use server";

import { headers } from "next/headers";
import { cache } from "react";
import { env } from "~/env";
import { auth } from "~/lib/auth";
import { db } from "~/server/db";
import clientPromise from "~/lib/mongodb";
import { ObjectId } from "mongodb";

interface GenerateImageData {
  prompt: string;
  negative_prompt?: string;
  width: number;
  height: number;
  num_inference_steps?: number;
  guidance_scale?: number;
  seed?: number;
  attention_backend?: string;
}

interface GenerateImageResult {
  success: boolean;
  imageUrl?: string;
  projectId?: string;
  seed?: number;
  modelId?: string;
  error?: string;
}

export async function generateImage(
  data: GenerateImageData,
): Promise<GenerateImageResult> {
  try {
    if (!env.MODAL_ENDPOINT) {
      return {
        success: false,
        error: "MODAL_ENDPOINT is not set",
      };
    }

    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) return { success: false, error: "Unauthorized" };
    if (!data.prompt || !data.width || !data.height)
      return { success: false, error: "Missing required fields" };

    const creditsNeeded = 1;

    // 1. Verify credits
    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { credits: true },
    });
    if (!user) return { success: false, error: "User not found" };
    if (user.credits < creditsNeeded)
      return {
        success: false,
        error: `Insufficient credits. Need ${creditsNeeded}, have ${user.credits}`,
      };

    // 2. Call Modal.com AI Model
    const response = await fetch(env.MODAL_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: data.prompt,
        userId: session.user.id, // Mandatory for backend logging
        negative_prompt: data.negative_prompt,
        width: data.width,
        height: data.height,
        num_inference_steps: data.num_inference_steps,
        guidance_scale: data.guidance_scale,
        seed: data.seed,
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return {
        success: false,
        error: text ? `Generation failed: ${text}` : "Failed to generate image",
      };
    }

    const result = (await response.json()) as {
      image_url: string;
      seed: number;
      model_id: string;
    };

    // 3. Deduct credit in Prisma and Store in MongoDB
    // Note: Modal backend already stores it in its own log,
    // but we want to store it in our "image_generator" DB for the UI.
    const client = await clientPromise;
    const mongodb = client.db("image_generator");
    const collection = mongodb.collection("images");

    const [updatedUser, mongoResult] = await Promise.all([
      db.user.update({
        where: { id: session.user.id },
        data: { credits: { decrement: creditsNeeded } },
      }),
      collection.insertOne({
        userId: session.user.id,
        prompt: data.prompt,
        negativePrompt: data.negative_prompt,
        imageUrl: result.image_url,
        width: data.width,
        height: data.height,
        numInferenceSteps: data.num_inference_steps ?? 9,
        guidanceScale: data.guidance_scale ?? 0,
        seed: result.seed,
        modelId: result.model_id,
        createdAt: new Date(),
      }),
    ]);

    return {
      success: true,
      imageUrl: result.image_url,
      seed: result.seed,
      modelId: result.model_id,
      projectId: mongoResult.insertedId.toString(),
    };
  } catch (error) {
    console.error("Image generation error:", error);
    return { success: false, error: "Internal server error" };
  }
}

export const getUserImageProjects = cache(async () => {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) return { success: false, error: "Unauthorized" };

    const client = await clientPromise;
    const mongodb = client.db("image_generator");
    const collection = mongodb.collection("images");

    const imageProjects = await collection
      .find({ userId: session.user.id })
      .sort({ createdAt: -1 })
      .toArray();

    // Convert MongoDB objects to safe JSON
    const safeProjects = imageProjects.map((project) => ({
      ...project,
      id: project._id.toString(),
      _id: project._id.toString(),
      seed: Number(project.seed),
    }));

    return { success: true, imageProjects: safeProjects };
  } catch (error) {
    console.error("Error fetching image projects:", error);
    return { success: false, error: "Failed to fetch image projects" };
  }
});

export async function deleteImageProject(id: string) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) return { success: false, error: "Unauthorized" };

    const client = await clientPromise;
    const mongodb = client.db("image_generator");
    const collection = mongodb.collection("images");

    const result = await collection.deleteOne({
      _id: new ObjectId(id),
      userId: session.user.id,
    });

    if (result.deletedCount === 0) {
      return { success: false, error: "Not found or unauthorized" };
    }

    return { success: true };
  } catch (error) {
    console.error("Error deleting image project:", error);
    return { success: false, error: "Failed to delete image project" };
  }
}
