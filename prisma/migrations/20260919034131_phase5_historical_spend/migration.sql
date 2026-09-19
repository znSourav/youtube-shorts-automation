-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_GenerationRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storyId" TEXT,
    "sceneId" TEXT,
    "generationType" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "estimatedUsd" REAL NOT NULL,
    "actualUsd" REAL,
    "billed" BOOLEAN NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GenerationRecord_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "GenerationRecord_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "Scene" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_GenerationRecord" ("actualUsd", "billed", "createdAt", "estimatedUsd", "generationType", "id", "message", "model", "ok", "sceneId", "storyId") SELECT "actualUsd", "billed", "createdAt", "estimatedUsd", "generationType", "id", "message", "model", "ok", "sceneId", "storyId" FROM "GenerationRecord";
DROP TABLE "GenerationRecord";
ALTER TABLE "new_GenerationRecord" RENAME TO "GenerationRecord";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
