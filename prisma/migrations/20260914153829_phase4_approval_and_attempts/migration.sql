-- AlterTable
ALTER TABLE "Story" ADD COLUMN "imagesApprovedAt" DATETIME;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Scene" (
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
    "imageAttempts" INTEGER NOT NULL DEFAULT 0,
    "videoAttempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Scene_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Scene" ("createdAt", "durationSeconds", "id", "imagePath", "imagePrompt", "imageStatus", "motionPrompt", "sceneNumber", "storyId", "storyPurpose", "videoPath", "videoStatus") SELECT "createdAt", "durationSeconds", "id", "imagePath", "imagePrompt", "imageStatus", "motionPrompt", "sceneNumber", "storyId", "storyPurpose", "videoPath", "videoStatus" FROM "Scene";
DROP TABLE "Scene";
ALTER TABLE "new_Scene" RENAME TO "Scene";
CREATE UNIQUE INDEX "Scene_storyId_sceneNumber_key" ON "Scene"("storyId", "sceneNumber");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
