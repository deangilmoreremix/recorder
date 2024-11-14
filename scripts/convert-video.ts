import { spawn } from "node:child_process";
import { existsSync, mkdirSync, renameSync, unlinkSync } from "node:fs";
import os from "os";
import path from "path";
import { prefixes } from "../src/helpers/prefixes";
import { getDownloadsFolder } from "./get-downloads-folder";
import { parseFfmpegProgress } from "./server/parse-ffmpeg-progress";

export const convertVideo = async ({
  input,
  output,
  onProgress,
  signal,
  expectedFrames,
}: {
  input: string;
  output: string;
  onProgress: (options: {
    framesEncoded: number;
    progress: number;
    filename: string;
  }) => void;
  signal: AbortSignal | undefined;
  expectedFrames: number | null;
}) => {
  const tempFile = path.join(os.tmpdir(), `temp${Math.random()}.mp4`);
  const proc = spawn(
    "bunx",
    [
      "remotion",
      "ffmpeg",
      "-stats_period",
      "0.1",
      "-hide_banner",
      "-i",
      input,
      "-movflags",
      "+faststart",
      "-r",
      "30",
      "-y",
      tempFile,
    ],
    {
      signal,
    },
  );

  const ffmpegOutput: Buffer[] = [];

  proc.stderr.on("data", (d) => {
    ffmpegOutput.push(d);
    const framesEncoded = parseFfmpegProgress(d.toString(), 30);
    if (framesEncoded !== undefined) {
      onProgress({
        filename: path.basename(output),
        framesEncoded: framesEncoded,
        progress: expectedFrames === null ? 0 : framesEncoded / expectedFrames,
      });
    }
  });
  proc.stdout.on("data", (d) => {
    ffmpegOutput.push(d);
  });

  await new Promise<void>((resolve, reject) => {
    return proc.on("close", (code, signal) => {
      if (code !== 0) {
        reject(
          new Error(
            `FFmpeg quit with code ${code} (signal ${signal}): ${Buffer.concat(ffmpegOutput).toString("utf8")}`,
          ),
        );
      } else {
        resolve();
      }
    });
  });

  if (expectedFrames) {
    onProgress({
      filename: path.basename(output),
      framesEncoded: expectedFrames,
      progress: 1,
    });
  }

  if (!existsSync(path.dirname(output))) {
    mkdirSync(path.dirname(output), { recursive: true });
  }

  renameSync(tempFile, output);
  unlinkSync(input);
};

export const convertVideos = async ({
  latestTimestamp,
  onProgress,
  expectedFrames,
  compositionId,
}: {
  onProgress: (options: {
    framesEncoded: number;
    progress: number;
    filename: string;
  }) => void;
  expectedFrames: number | null;
  latestTimestamp: number;
  compositionId: string;
}) => {
  const fileLocation = getDownloadsFolder();

  for (const prefix of prefixes) {
    const latest = `${prefix}${latestTimestamp}.webm`;
    const src = path.join(fileLocation, latest);
    const folder = path.join("public", compositionId);

    if (existsSync(src)) {
      await convertVideo({
        input: src,
        output: path.join(folder, latest.replace(".webm", ".mp4")),
        onProgress,
        signal: undefined,
        expectedFrames,
      });
    }
  }
};