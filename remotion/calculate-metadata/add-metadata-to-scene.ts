import { getVideoMetadata } from "@remotion/media-utils";
import { CanvasLayout } from "../../config/layout";
import {
  Cameras,
  SceneAndMetadata,
  SceneVideos,
  SelectableScene,
} from "../../config/scenes";
import { calculateSrt } from "../captions/srt/helpers/calculate-srt";
import { getBRollDimensions } from "../layout/get-broll-dimensions";
import { getVideoSceneLayout } from "../layout/get-layout";
import { PLACEHOLDER_DURATION_IN_FRAMES } from "./empty-place-holder";
import { fetchCaptions } from "./fetch-captions";
import { getFinalWebcamPosition } from "./get-final-webcam-position";
import { getStartEndFrame } from "./get-start-end-frame";

export const addMetadataToScene = async ({
  scene,
  cameras,
  hasAtLeast1Camera,
  allScenes,
  canvasLayout,
}: {
  scene: SelectableScene;
  cameras: Cameras | null;
  hasAtLeast1Camera: boolean;
  canvasLayout: CanvasLayout;
  allScenes: SelectableScene[];
}): Promise<SceneAndMetadata> => {
  if (scene.type !== "videoscene") {
    return {
      type: "other-scene",
      scene,
      durationInFrames: scene.durationInFrames,
      from: 0,
    };
  }

  if (!cameras) {
    return {
      type: "other-scene",
      scene: {
        type: hasAtLeast1Camera ? "nomorerecordings" : "norecordings",
        transitionToNextScene: scene.transitionToNextScene,
        music: scene.music,
      },
      durationInFrames: PLACEHOLDER_DURATION_IN_FRAMES,
      from: 0,
    };
  }

  const webcamMetadata = await getVideoMetadata(cameras.webcam.src);

  const displayMetadata = cameras.display
    ? await getVideoMetadata(cameras.display.src)
    : null;

  const captions = await fetchCaptions(cameras.captions);

  const { actualStartFrame, derivedEndFrame } = await getStartEndFrame({
    scene,
    recordingDurationInSeconds: webcamMetadata.durationInSeconds,
    captions,
  });

  const srt = captions
    ? calculateSrt({
        startFrame: actualStartFrame,
        captions,
      })
    : [];

  const webcamPosition = getFinalWebcamPosition({
    canvasLayout,
    cameras,
    scenes: allScenes,
    scene,
  });

  const bRollWithDimensions = await Promise.all(
    scene.bRolls.map((bRoll) => getBRollDimensions(bRoll)),
  );

  const videos: SceneVideos = {
    display: displayMetadata,
    webcam: webcamMetadata,
  };

  return {
    type: "video-scene",
    scene,
    videos,
    layout: getVideoSceneLayout({
      webcamPosition: webcamPosition,
      videos,
      canvasLayout,
    }),
    durationInFrames: derivedEndFrame - actualStartFrame,
    cameras,
    webcamPosition: webcamPosition,
    from: 0,
    chapter: scene.newChapter ?? null,
    startFrame: actualStartFrame,
    endFrame: derivedEndFrame,
    bRolls: bRollWithDimensions,
    srt,
  };
};