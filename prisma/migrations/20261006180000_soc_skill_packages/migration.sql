-- CreateTable
CREATE TABLE "SocSkillPackage" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "sourceChecksum" TEXT NOT NULL,
    "rootDir" TEXT NOT NULL,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocSkillPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocCurrentSkill" (
    "key" TEXT NOT NULL DEFAULT 'current',
    "packageId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocCurrentSkill_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "SocSkillPackage_version_key" ON "SocSkillPackage"("version");

-- CreateIndex
CREATE UNIQUE INDEX "SocSkillPackage_storageKey_key" ON "SocSkillPackage"("storageKey");

-- CreateIndex
CREATE INDEX "SocSkillPackage_createdAt_idx" ON "SocSkillPackage"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SocCurrentSkill_packageId_key" ON "SocCurrentSkill"("packageId");

-- AddForeignKey
ALTER TABLE "SocSkillPackage" ADD CONSTRAINT "SocSkillPackage_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocCurrentSkill" ADD CONSTRAINT "SocCurrentSkill_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "SocSkillPackage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Only one row may exist, so exactly one package is current.
ALTER TABLE "SocCurrentSkill" ADD CONSTRAINT "SocCurrentSkill_single_row" CHECK ("key" = 'current');
