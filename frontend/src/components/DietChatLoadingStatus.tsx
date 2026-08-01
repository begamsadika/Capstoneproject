import { useEffect, useMemo, useState } from "react";
import { WelloraLogoMark } from "./WelloraLogoMark";
import {
  DietChatAnswerSource,
  DietChatSourceIndicator,
} from "./DietChatSourceIndicator";

interface DietChatLoadingStatusProps {
  question: string;
  sources?: DietChatAnswerSource[];
}

const STAGE_INTERVAL_MS = 1250;
const ELLIPSIS_INTERVAL_MS = 350;
const SLOW_RESPONSE_MS = 10_000;
const FADE_DURATION_MS = 180;

function buildThinkingStages(question: string): string[] {
  const text = question.toLowerCase();
  const isMedical = /condition|medicat|medicine|drug|warfarin|statin|levothyrox|diabet|hypertension|blood pressure|cholesterol|pcos|thyroid|allerg|avoid/.test(text);
  const isCalories = /calorie|calories|kcal|energy|deficit|surplus|\bbmr\b|\btdee\b|macro/.test(text);
  const isMealRecommendation = /meal|food|eat|breakfast|lunch|dinner|snack|recipe|recommend|suggest/.test(text);
  const isNutrition = /nutrition|nutrient|protein|carb|fat|fiber|fibre|vitamin|mineral|ingredient|glycemic|glycaemic|\bgi\b/.test(text);

  if (isMedical) {
    return [
      "Understanding your question",
      "Reading your health profile",
      "Checking your health goals",
      "Checking allergies and dietary restrictions",
      "Reviewing conditions and medications",
      "Applying nutrition safety rules",
      "Personalizing your recommendation",
      "Generating your response",
    ];
  }

  if (isCalories) {
    return [
      "Understanding your question",
      "Reading your health profile",
      "Calculating calorie requirements",
      "Matching your health goals",
      "Preparing your personalized answer",
      "Generating your response",
    ];
  }

  if (isMealRecommendation) {
    return [
      "Understanding your request",
      "Reading your health profile",
      "Finding suitable meals",
      "Checking allergies and dietary restrictions",
      "Matching your health goals",
      "Checking calorie requirements",
      "Preparing recommendations",
      "Generating your response",
    ];
  }

  if (isNutrition) {
    return [
      "Understanding your question",
      "Analyzing nutritional values",
      "Reviewing ingredients",
      "Matching your health profile",
      "Preparing your answer",
      "Generating your response",
    ];
  }

  return [
    "Understanding your question",
    "Searching nutrition knowledge",
    "Checking your health profile",
    "Preparing your response",
    "Generating your response",
  ];
}

export function DietChatLoadingStatus({ question, sources }: DietChatLoadingStatusProps) {
  const stages = useMemo(() => buildThinkingStages(question), [question]);
  const [activeStage, setActiveStage] = useState(0);
  const [ellipsisLength, setEllipsisLength] = useState(1);
  const [visible, setVisible] = useState(true);
  const [isSlowResponse, setIsSlowResponse] = useState(false);

  useEffect(() => {
    setActiveStage(0);
    setEllipsisLength(1);
    setVisible(true);
    setIsSlowResponse(false);

    let fadeTimeout: number | undefined;

    const ellipsisInterval = window.setInterval(() => {
      setEllipsisLength((length) => (length >= 3 ? 1 : length + 1));
    }, ELLIPSIS_INTERVAL_MS);

    const stageInterval = window.setInterval(() => {
      setVisible(false);
      if (fadeTimeout !== undefined) window.clearTimeout(fadeTimeout);
      fadeTimeout = window.setTimeout(() => {
        setActiveStage((current) => (current + 1) % stages.length);
        setEllipsisLength(1);
        setVisible(true);
      }, FADE_DURATION_MS);
    }, STAGE_INTERVAL_MS);

    const slowResponseTimeout = window.setTimeout(() => {
      window.clearInterval(stageInterval);
      if (fadeTimeout !== undefined) window.clearTimeout(fadeTimeout);
      setVisible(false);
      fadeTimeout = window.setTimeout(() => {
        setIsSlowResponse(true);
        setVisible(true);
      }, FADE_DURATION_MS);
    }, SLOW_RESPONSE_MS);

    return () => {
      window.clearInterval(ellipsisInterval);
      window.clearInterval(stageInterval);
      window.clearTimeout(slowResponseTimeout);
      if (fadeTimeout !== undefined) window.clearTimeout(fadeTimeout);
    };
  }, [stages]);

  const accessibleStatus = isSlowResponse
    ? "This is taking a little longer than expected. Still preparing your personalized recommendation."
    : stages[activeStage];

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-w-[210px] items-center gap-2.5 py-1 sm:min-w-[240px]"
    >
      <span className="sr-only">{accessibleStatus}</span>

      {sources?.length ? (
        <span className="flex items-center gap-1">
          {sources.map((source) => (
            <DietChatSourceIndicator key={source} source={source} active />
          ))}
        </span>
      ) : (
        <WelloraLogoMark
          size="xs"
          className="animate-pulse motion-reduce:animate-none"
        />
      )}

      <div className="min-w-0 flex-1">
        <div
          aria-hidden="true"
          className={`transition-opacity duration-200 ease-in-out motion-reduce:transition-none ${visible ? "opacity-100" : "opacity-0"}`}
        >
          {isSlowResponse ? (
            <div className="space-y-0.5 text-xs leading-5 text-slate-600 dark:text-slate-300">
              <p>This is taking a little longer than expected...</p>
              <p className="text-slate-500 dark:text-slate-400">
                Still preparing your personalized recommendation...
              </p>
            </div>
          ) : (
            <p className="text-sm leading-5 text-slate-500 dark:text-slate-400">
              {stages[activeStage]}{".".repeat(ellipsisLength)}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
