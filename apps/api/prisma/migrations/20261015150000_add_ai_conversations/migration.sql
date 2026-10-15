CREATE TABLE "AiConversation" (
 "id" UUID NOT NULL PRIMARY KEY, "userId" UUID NOT NULL, "title" VARCHAR(160) NOT NULL,
 "scopeKey" VARCHAR(200) NOT NULL, "accessKey" VARCHAR(64) NOT NULL, "version" INTEGER NOT NULL DEFAULT 0,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMPTZ(3) NOT NULL,
 CONSTRAINT "AiConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "AiConversation_userId_scopeKey_updatedAt_idx" ON "AiConversation"("userId", "scopeKey", "updatedAt");
CREATE TABLE "AiMessage" (
 "id" UUID NOT NULL PRIMARY KEY, "conversationId" UUID NOT NULL, "ordinal" INTEGER NOT NULL,
 "role" VARCHAR(16) NOT NULL CHECK ("role" IN ('user', 'assistant')), "content" TEXT NOT NULL,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "AiMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AiConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AiMessage_conversationId_ordinal_key" ON "AiMessage"("conversationId", "ordinal");
