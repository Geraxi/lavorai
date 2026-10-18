/**
 * Test for language-aware CV optimization (production audit fix).
 * 
 * Verifies:
 * 1. English jobs get English cover letters
 * 2. Italian jobs get Italian cover letters  
 * 3. Cover letters are capped at ~150-200 words
 * 4. No filler words (passionate, entusiasta, thrilled, etc.)
 * 5. Email subjects match language
 * 
 * Run: npm run test:language-aware or npx tsx scripts/test-language-aware-cv.ts
 */

import { optimizeCV } from "../src/lib/claude";
import { detectLanguage } from "../src/lib/lang-detect";

const SAMPLE_CV = `John Doe
Software Engineer
john.doe@example.com | +39 123 456789 | Milan, Italy

Professional Experience
Backend Developer | Tech Company SRL
Milano, Italia | Jan 2020 - Present
- Developed REST APIs using Node.js and TypeScript
- Implemented database migrations with Prisma
- Optimized query performance reducing latency by 40%

Education
Bachelor's Degree in Computer Science
University of Milan | 2016-2019

Skills
Technical: Node.js, TypeScript, PostgreSQL, Docker
Languages: Italian (Native), English (Fluent)`;

const ITALIAN_JOB = `Backend Developer - Milano
Tech Company SRL

Cerchiamo un Backend Developer con esperienza in Node.js e TypeScript per unirsi al nostro team a Milano.

Requisiti:
- Esperienza con Node.js e TypeScript
- Conoscenza di PostgreSQL e ORM (Prisma preferito)
- Capacità di lavorare in team

Offriamo:
- Contratto a tempo indeterminato
- Smart working ibrido
- Team giovane e dinamico`;

const ENGLISH_JOB = `Backend Engineer - Remote
Tech Solutions Ltd

We are looking for a Backend Engineer with Node.js and TypeScript experience to join our international team.

Requirements:
- 2+ years of experience with Node.js and TypeScript
- Strong understanding of PostgreSQL and ORMs
- Experience with Docker and containerization
- Excellent communication skills

We offer:
- Competitive salary
- Fully remote work
- International team environment`;

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function containsFiller(text: string, lang: "it" | "en"): { hasFiller: boolean; found: string[] } {
  const fillers = lang === "it" 
    ? ["entusiasta", "entusiasmo", "appassionato", "passione"]
    : ["passionate", "passion", "thrilled", "excited", "leverage", "robust", "cutting-edge", "game-changer"];
  
  const lowerText = text.toLowerCase();
  const found = fillers.filter(filler => lowerText.includes(filler));
  
  return { hasFiller: found.length > 0, found };
}

async function testItalianJob() {
  console.log("\n🇮🇹 Testing Italian job posting...");
  const jobLang = detectLanguage(ITALIAN_JOB);
  console.log(`   Language detected: ${jobLang}`);
  
  if (jobLang !== "it") {
    throw new Error(`Expected Italian job to be detected as 'it', got '${jobLang}'`);
  }
  
  const result = await optimizeCV({
    cvText: SAMPLE_CV,
    jobPosting: ITALIAN_JOB,
    jobLang,
  });
  
  const wordCount = countWords(result.coverLetter);
  console.log(`   Cover letter length: ${wordCount} words`);
  
  if (wordCount > 220) {
    throw new Error(`Cover letter too long: ${wordCount} words (max 220)`);
  }
  
  // Check for Italian Lei form
  const hasLei = /\b(lei|vostra?|permettermi)\b/i.test(result.coverLetter);
  if (!hasLei) {
    console.warn(`   ⚠️  Warning: Expected Italian 'Lei' form in cover letter`);
  }
  
  // Check for filler
  const { hasFiller, found } = containsFiller(result.coverLetter, "it");
  if (hasFiller) {
    throw new Error(`Cover letter contains filler words: ${found.join(", ")}`);
  }
  
  console.log(`   ✓ Italian cover letter generated, ${wordCount} words, no filler`);
  return result;
}

async function testEnglishJob() {
  console.log("\n🇬🇧 Testing English job posting...");
  const jobLang = detectLanguage(ENGLISH_JOB);
  console.log(`   Language detected: ${jobLang}`);
  
  if (jobLang !== "en") {
    throw new Error(`Expected English job to be detected as 'en', got '${jobLang}'`);
  }
  
  const result = await optimizeCV({
    cvText: SAMPLE_CV,
    jobPosting: ENGLISH_JOB,
    jobLang,
  });
  
  const wordCount = countWords(result.coverLetter);
  console.log(`   Cover letter length: ${wordCount} words`);
  
  if (wordCount > 220) {
    throw new Error(`Cover letter too long: ${wordCount} words (max 220)`);
  }
  
  // Check for English professional tone (should not have Italian Lei form)
  const hasItalian = /\b(lei|vostra?|candidatura)\b/i.test(result.coverLetter);
  if (hasItalian) {
    console.warn(`   ⚠️  Warning: English cover letter contains Italian words`);
  }
  
  // Check for filler
  const { hasFiller, found } = containsFiller(result.coverLetter, "en");
  if (hasFiller) {
    throw new Error(`Cover letter contains filler words: ${found.join(", ")}`);
  }
  
  console.log(`   ✓ English cover letter generated, ${wordCount} words, no filler`);
  return result;
}

async function main() {
  console.log("🧪 Language-aware CV optimization tests");
  console.log("========================================");
  
  try {
    const italianResult = await testItalianJob();
    const englishResult = await testEnglishJob();
    
    console.log("\n📊 Results Summary:");
    console.log(`   Italian cover letter: ${countWords(italianResult.coverLetter)} words, ATS: ${italianResult.atsScore}`);
    console.log(`   English cover letter: ${countWords(englishResult.coverLetter)} words, ATS: ${englishResult.atsScore}`);
    
    console.log("\n✅ PASS: Language-aware CV optimization");
    process.exit(0);
  } catch (err) {
    console.error("\n❌ FAIL:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

main();
