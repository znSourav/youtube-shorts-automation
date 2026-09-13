-- CreateTable
CREATE TABLE "Story" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "premise" TEXT NOT NULL,
    "fullStory" TEXT NOT NULL,
    "theme" TEXT NOT NULL,
    "emotionalArc" TEXT NOT NULL,
    "ending" TEXT NOT NULL,
    "protagonistWant" TEXT NOT NULL,
    "centralObstacle" TEXT NOT NULL,
    "endingShape" TEXT NOT NULL,
    "characterBible" JSONB NOT NULL,
    "styleBible" JSONB NOT NULL,
    "uniquenessStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "regenerationAttempt" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Scene" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storyId" TEXT NOT NULL,
    "sceneNumber" INTEGER NOT NULL,
    "storyPurpose" TEXT NOT NULL,
    "imagePrompt" TEXT NOT NULL,
    "motionPrompt" TEXT NOT NULL,
    "durationSeconds" INTEGER,
    "imagePath" TEXT,
    "imageStatus" TEXT NOT NULL DEFAULT 'WAITING',
    "videoPath" TEXT,
    "videoStatus" TEXT NOT NULL DEFAULT 'WAITING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Scene_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GenerationRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storyId" TEXT NOT NULL,
    "sceneId" TEXT,
    "generationType" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "estimatedUsd" REAL NOT NULL,
    "actualUsd" REAL,
    "billed" BOOLEAN NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GenerationRecord_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "GenerationRecord_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "Scene" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Scene_storyId_sceneNumber_key" ON "Scene"("storyId", "sceneNumber");
