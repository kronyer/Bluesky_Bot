import { BskyAgent } from "@atproto/api";
import * as dotenv from "dotenv";
import { CronJob } from "cron";
import * as process from "process";
import axios from "axios";
import sharp from "sharp";

dotenv.config();

// Define sua chave de API como uma constante para facilitar a manutenção
const STABLE_DIFFUSION_API_KEY = process.env.BLUESKY_USERNAME!;
const IMAGE_MIMETYPE = "image/jpeg"; // Atualizado para o tipo correto após compressão
const IMAGE_ALT_TEXT = "Ai generated Ukiyo-e";

const haiku = "Old pond — frogs jumped in — sound of water.";

async function generateImage(prompt: string): Promise<Buffer | undefined> {
  try {
    const response = await axios.post(
      "https://api.stability.ai/v1/generation/stable-diffusion-v1-6/text-to-image",
      {
        cfg_scale: 7,
        height: 512,
        width: 512,
        sampler: "K_DPM_2_ANCESTRAL",
        samples: 1,
        steps: 10,
        text_prompts: [
          {
            text: prompt,
            weight: 1,
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${STABLE_DIFFUSION_API_KEY}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      }
    );

    // A resposta contém uma imagem base64
    const base64Image = response.data.artifacts[0].base64;

    // Converte base64 para Buffer
    const imageBuffer = Buffer.from(base64Image, "base64");

    // Comprime a imagem usando sharp
    const compressedImageBuffer = await sharp(imageBuffer)
      .resize({ width: 512, height: 512, fit: "inside" })
      .jpeg({ quality: 50 })
      .toBuffer();

    return compressedImageBuffer;
  } catch (error) {
    console.error("Error generating image:", error);
  }
}

async function uploadImageBlob(
  imageBuffer: Buffer,
  accessJwt
): Promise<string | undefined> {
  try {
    const response = await axios.post(
      "https://bsky.social/xrpc/com.atproto.repo.uploadBlob",
      imageBuffer,
      {
        headers: {
          "Content-Type": IMAGE_MIMETYPE,
          Authorization: `Bearer ${accessJwt}`,
        },
      }
    );

    // Retorna o blobRef da resposta
    const blobRef = response.data.blob;
    return blobRef;
  } catch (error) {
    console.error("Error uploading image blob:", error);
  }
}

// Create a Bluesky Agent
const agent = new BskyAgent({
  service: "https://bsky.social",
});

async function main() {
  const response = await agent.login({
    identifier: process.env.BLUESKY_USERNAME!,
    password: process.env.BLUESKY_PASSWORD!,
  });

  const { accessJwt, refreshJwt } = response.data;

  console.log(accessJwt);

  // Garante que a imagem seja gerada e carregada antes de fazer o post
  const imageBuffer = await generateImage(
    "Generate a picture in the ukiyo-e style about the following haiku:" +
      { haiku }
  );

  if (imageBuffer) {
    const blobRef = await uploadImageBlob(imageBuffer, accessJwt);

    if (blobRef) {
      await agent.post({
        text: "Old pond — \nfrogs jumped in — \nsound of water.",
        embed: {
          $type: "app.bsky.embed.images",
          images: [
            {
              alt: IMAGE_ALT_TEXT,
              image: blobRef, // Use o blobRef retornado aqui
              aspectRatio: {
                width: 1000,
                height: 500,
              },
            },
          ],
        },
      });
      console.log("Just posted!");
    }
  }
}

main();

// Run this on a cron job
const scheduleExpressionMinute = "* * * * *"; // Run once every minute for testing
const scheduleExpression = "0 */3 * * *"; // Run once every three hours in prod

const job = new CronJob(scheduleExpression, main); // change to scheduleExpressionMinute for testing

job.start();
