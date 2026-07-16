// backend/tests/universalImport.test.js
// Tests for the Universal Import System:
//   - POST /api/imports/parse  (file upload & parsing)
//   - POST /api/imports/jobs   (history logging)
//   - GET  /api/imports/jobs   (history retrieval)
//   - Extended question types in POST /api/tests/:id/questions/bulk

"use strict";

const request = require("supertest");
const path = require("path");
const fs = require("fs");

jest.mock("../lib/redis",   () => require("./helpers/mockRedis"));
jest.mock("../lib/audit",   () => ({ logAudit: jest.fn().mockResolvedValue(undefined) }));
jest.mock("../lib/env",     () => ({ validateEnv: jest.fn(), startupGuard: (_req, _res, next) => next() }));

const { createMockSupabase, ok, err } = require("./helpers/mockSupabase");

// ── Fixtures ────────────────────────────────────────────────────────────────────

const ADMIN   = { id: "admin-1",   role: "admin",   institution_id: "inst-1" };
const FACULTY = { id: "fac-1",     role: "faculty", institution_id: "inst-1" };
const STUDENT = { id: "student-1", role: "student", institution_id: "inst-1" };
const TEST    = { id: "test-1",    institution_id: "inst-1" };

function makeJWT(user) {
  const jwt = require("jsonwebtoken");
  const secret = process.env.SUPABASE_JWT_SECRET || "test-secret";
  return `Bearer ${jwt.sign({ sub: user.id }, secret, { expiresIn: "1h" })}`;
}

function buildApp(supabaseMock) {
  jest.resetModules();
  jest.doMock("../lib/supabase", () => supabaseMock);
  jest.doMock("../lib/redis",   () => require("./helpers/mockRedis"));
  jest.doMock("../lib/audit",   () => ({ logAudit: jest.fn().mockResolvedValue(undefined) }));
  jest.doMock("../lib/env",     () => ({ validateEnv: jest.fn(), startupGuard: (_req, _res, next) => next() }));
  return require("../server");
}

function buildApp_simple() {
  const supa = createMockSupabase({});
  // profile lookup always returns the admin
  supa.from.mockImplementation((table) => {
    if (table === "profiles") {
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue(ok(ADMIN)),
      };
    }
    if (table === "import_jobs") {
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        insert: jest.fn().mockReturnValue({ then: r => r(ok([])) }),
        then: r => r(ok([])),
      };
    }
    return {
      select: jest.fn().mockReturnThis(),
      eq:     jest.fn().mockReturnThis(),
      order:  jest.fn().mockReturnThis(),
      limit:  jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue(ok(null)),
      maybeSingle: jest.fn().mockResolvedValue(ok(null)),
      insert: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ then: r => r(ok([])) }) }),
      then:   r => r(ok([])),
    };
  });
  return buildApp(supa);
}

// ── Helpers ──────────────────────────────────────────────────────────────────────

function csvBuffer(text) { return Buffer.from(text, "utf-8"); }
function jsonBuffer(obj) { return Buffer.from(JSON.stringify(obj), "utf-8"); }

// ── POST /api/imports/parse ────────────────────────────────────────────────────

describe("POST /api/imports/parse", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    process.env = { ...OLD_ENV, SUPABASE_JWT_SECRET: "test-secret" };
    require("./helpers/mockRedis").clearAll();
    require("./helpers/mockRedis").cacheHit(`profile:${ADMIN.id}`, ADMIN);
  });
  afterAll(() => { process.env = OLD_ENV; });

  test("401 — no auth token", async () => {
    const app = buildApp_simple();
    const res = await request(app)
      .post("/api/imports/parse")
      .attach("file", csvBuffer("type,question\n"), "test.csv");
    expect(res.status).toBe(401);
  });

  test("403 — student cannot parse", async () => {
    const supa = createMockSupabase({});
    supa.from.mockImplementation(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue(ok(STUDENT)),
    }));
    const app = buildApp(supa);
    require("./helpers/mockRedis").cacheHit(`profile:${STUDENT.id}`, STUDENT);

    const res = await request(app)
      .post("/api/imports/parse")
      .set("Authorization", makeJWT(STUDENT))
      .attach("file", csvBuffer("type,question\n"), "test.csv");
    expect(res.status).toBe(403);
  });

  test("400 — no file attached", async () => {
    const app = buildApp_simple();
    const res = await request(app)
      .post("/api/imports/parse")
      .set("Authorization", makeJWT(ADMIN))
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/file/i);
  });

  test("parses a valid CSV file and returns rows", async () => {
    const app = buildApp_simple();
    const csv = [
      "type,question,option_a,option_b,option_c,option_d,correct_answer,marks",
      "mcq,What is 2+2?,1,2,4,8,C,2",
      "short,Explain recursion,,,,,,1",
    ].join("\n");

    const res = await request(app)
      .post("/api/imports/parse")
      .set("Authorization", makeJWT(ADMIN))
      .attach("file", csvBuffer(csv), "questions.csv");

    expect(res.status).toBe(200);
    expect(res.body.data.rows).toHaveLength(2);
    expect(res.body.data.stats.total).toBe(2);
    expect(res.body.data.file.name).toBe("questions.csv");
  });

  test("parses a JSON file and returns rows", async () => {
    const app = buildApp_simple();
    const json = [
      { type: "mcq", question: "Capital of France?", options: ["London","Paris","Berlin","Madrid"], correct_answer: "1", marks: 2 },
      { type: "coding", question: "Write binary search", marks: 5 },
    ];

    const res = await request(app)
      .post("/api/imports/parse")
      .set("Authorization", makeJWT(ADMIN))
      .attach("file", jsonBuffer(json), "questions.json");

    expect(res.status).toBe(200);
    expect(res.body.data.rows).toHaveLength(2);
    expect(res.body.data.rows[0].type).toBe("mcq");
    expect(res.body.data.rows[1].type).toBe("coding");
  });

  test("rejects unsupported file format (.exe)", async () => {
    const app = buildApp_simple();
    const res = await request(app)
      .post("/api/imports/parse")
      .set("Authorization", makeJWT(ADMIN))
      .attach("file", Buffer.from("MZ"), "malware.exe");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not supported/i);
  });

  test("parses TXT file with numbered questions", async () => {
    const app = buildApp_simple();
    const txt = [
      "1. What is the largest planet in the solar system?",
      "a) Earth",
      "b) Mars",
      "c) Jupiter",
      "d) Saturn",
      "Answer: c",
      "Marks: 2",
      "",
      "2. The Earth is flat.",
      "a) True",
      "b) False",
      "Answer: False",
    ].join("\n");

    const res = await request(app)
      .post("/api/imports/parse")
      .set("Authorization", makeJWT(ADMIN))
      .attach("file", csvBuffer(txt), "questions.txt");

    expect(res.status).toBe(200);
    const rows = res.body.data.rows;
    expect(rows.length).toBeGreaterThanOrEqual(1);
    // First question should be MCQ
    expect(rows[0].type).toBe("mcq");
  });

  test("parses Markdown file with questions", async () => {
    const app = buildApp_simple();
    const md = [
      "## Question 1",
      "What is TypeScript?",
      "",
      "a) A database",
      "b) A superset of JavaScript",
      "c) A CSS framework",
      "d) A testing tool",
      "",
      "Answer: b",
      "Marks: 3",
    ].join("\n");

    const res = await request(app)
      .post("/api/imports/parse")
      .set("Authorization", makeJWT(ADMIN))
      .attach("file", csvBuffer(md), "questions.md");

    expect(res.status).toBe(200);
    expect(res.body.data.rows.length).toBeGreaterThanOrEqual(1);
  });

  test("returns fileErrors for invalid JSON", async () => {
    const app = buildApp_simple();
    const res = await request(app)
      .post("/api/imports/parse")
      .set("Authorization", makeJWT(ADMIN))
      .attach("file", Buffer.from("{not valid json"), "bad.json");

    // Should either be 400 (validation) or 200 with fileErrors
    if (res.status === 200) {
      expect(res.body.data.fileErrors.length).toBeGreaterThan(0);
    } else {
      expect([400, 422]).toContain(res.status);
    }
  });
});

// ── POST /api/imports/jobs ─────────────────────────────────────────────────────

describe("POST /api/imports/jobs", () => {
  const OLD_ENV = process.env;
  beforeEach(() => {
    process.env = { ...OLD_ENV, SUPABASE_JWT_SECRET: "test-secret" };
    require("./helpers/mockRedis").clearAll();
    require("./helpers/mockRedis").cacheHit(`profile:${ADMIN.id}`, ADMIN);
  });
  afterAll(() => { process.env = OLD_ENV; });

  test("201 — creates a job record", async () => {
    const app = buildApp_simple();
    const res = await request(app)
      .post("/api/imports/jobs")
      .set("Authorization", makeJWT(ADMIN))
      .send({
        file_name: "test.csv",
        file_type: "csv",
        file_size: 1024,
        total_questions: 10,
        inserted: 8,
        skipped: 2,
        failed_count: 0,
        error_log: [],
      });

    expect(res.status).toBe(201);
    expect(res.body.data.file_name).toBe("test.csv");
    expect(res.body.data.inserted).toBe(8);
    expect(res.body.data.id).toBeTruthy();
  });

  test("400 — missing file_name", async () => {
    const app = buildApp_simple();
    const res = await request(app)
      .post("/api/imports/jobs")
      .set("Authorization", makeJWT(ADMIN))
      .send({ inserted: 5 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/file_name/i);
  });

  test("403 — student cannot create job", async () => {
    const supa = createMockSupabase({});
    supa.from.mockImplementation(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue(ok(STUDENT)),
    }));
    const app = buildApp(supa);
    require("./helpers/mockRedis").cacheHit(`profile:${STUDENT.id}`, STUDENT);

    const res = await request(app)
      .post("/api/imports/jobs")
      .set("Authorization", makeJWT(STUDENT))
      .send({ file_name: "x.csv", inserted: 5 });
    expect(res.status).toBe(403);
  });
});

// ── GET /api/imports/jobs ──────────────────────────────────────────────────────

describe("GET /api/imports/jobs", () => {
  const OLD_ENV = process.env;
  beforeEach(() => {
    process.env = { ...OLD_ENV, SUPABASE_JWT_SECRET: "test-secret" };
    require("./helpers/mockRedis").clearAll();
    require("./helpers/mockRedis").cacheHit(`profile:${ADMIN.id}`, ADMIN);
  });
  afterAll(() => { process.env = OLD_ENV; });

  test("200 — returns jobs array", async () => {
    const app = buildApp_simple();
    const res = await request(app)
      .get("/api/imports/jobs")
      .set("Authorization", makeJWT(ADMIN));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test("401 — no auth", async () => {
    const app = buildApp_simple();
    const res = await request(app).get("/api/imports/jobs");
    expect(res.status).toBe(401);
  });
});

// ── Extended question types in bulk endpoint ────────────────────────────────────

describe("POST /api/tests/:id/questions/bulk — extended types", () => {
  const OLD_ENV = process.env;

  function buildBulkApp(insertedIds = ["id-1"]) {
    const supa = createMockSupabase({});
    supa.from.mockImplementation((table) => {
      if (table === "profiles") {
        return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), single: jest.fn().mockResolvedValue(ok(ADMIN)) };
      }
      if (table === "tests") {
        return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), single: jest.fn().mockResolvedValue(ok(TEST)) };
      }
      if (table === "test_questions") {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue(ok(null)),
          then: r => r(ok([])),
          insert: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              then: r => r(ok(insertedIds.map(id => ({ id })))),
            }),
          }),
          delete: jest.fn().mockReturnThis(),
          in: jest.fn().mockReturnValue({ then: r => r(ok(null)) }),
        };
      }
      return {};
    });
    return buildApp(supa);
  }

  beforeEach(() => {
    process.env = { ...OLD_ENV, SUPABASE_JWT_SECRET: "test-secret" };
    require("./helpers/mockRedis").clearAll();
    require("./helpers/mockRedis").cacheHit(`profile:${ADMIN.id}`, ADMIN);
  });
  afterAll(() => { process.env = OLD_ENV; });

  test("accepts all 14 question types", async () => {
    const app = buildBulkApp(Array.from({ length: 14 }, (_, i) => `id-${i}`));

    const questions = [
      { question: "Single correct multiple choice question here?", type: "mcq", options: ["A","B","C","D"], correct_answer: "0", marks: 1 },
      { question: "Multiple correct multiple choice question here?", type: "mcq-multi", options: ["A","B","C","D"], correct_answer: "0,2", marks: 1 },
      { question: "Is the sky blue statement for evaluation?", type: "true-false", options: ["True","False"], correct_answer: "0", marks: 1 },
      { question: "The capital of France is ________ city.", type: "fill-blank", correct_answer: "Paris", marks: 1 },
      { question: "What is polymorphism in object-oriented concepts?", type: "short", marks: 2 },
      { question: "Explain the concept of machine learning in detail.", type: "long", marks: 5 },
      { question: "Describe the impact of the Industrial Revolution.", type: "descriptive", marks: 10 },
      { question: "Write a function to find the maximum element.", type: "coding", marks: 5 },
      { question: "Write a query to find all employees earning above 50000.", type: "sql", marks: 3 },
      { question: "Based on the case, what decision would you recommend?", type: "case-study", marks: 10 },
      { question: "Match the programming languages to their paradigms.", type: "matching", options: ["Python→OOP","Java→OOP","SQL→Declarative","Haskell→Functional"], marks: 4 },
      { question: "Arrange the software development phases in correct order.", type: "ordering", options: ["Design","Testing","Development","Planning"], marks: 3 },
      { question: "What is the time complexity of binary search algorithm?", type: "numerical", correct_answer: "log(n)", marks: 2 },
      { question: "Based on the passage above, what is the main theme?", type: "paragraph", marks: 5 },
    ];

    const res = await request(app)
      .post("/api/tests/test-1/questions/bulk")
      .set("Authorization", makeJWT(ADMIN))
      .send({ questions });

    expect(res.status).toBe(201);
    expect(res.body.data.inserted).toBeGreaterThan(0);
    expect(res.body.data.errors).toHaveLength(0);
  });

  test("rejects unknown question type", async () => {
    const app = buildBulkApp([]);

    const res = await request(app)
      .post("/api/tests/test-1/questions/bulk")
      .set("Authorization", makeJWT(ADMIN))
      .send({
        questions: [{ question: "What is this unknown type question?", type: "alien-type", marks: 1 }],
      });

    // Either 422 (all invalid) or skipped with error
    if (res.status === 201) {
      expect(res.body.data.skipped).toBeGreaterThan(0);
      expect(res.body.data.errors[0].errors.join(" ")).toMatch(/type/i);
    } else {
      expect(res.status).toBe(422);
    }
  });

  test("accepts optional enrichment fields (explanation, difficulty, tags)", async () => {
    const app = buildBulkApp(["id-1"]);

    const res = await request(app)
      .post("/api/tests/test-1/questions/bulk")
      .set("Authorization", makeJWT(ADMIN))
      .send({
        questions: [{
          question: "What is time complexity of binary search algorithm here?",
          type: "mcq",
          options: ["O(n)","O(log n)","O(n²)","O(1)"],
          correct_answer: "1",
          marks: 2,
          explanation: "Binary search halves the search space each step.",
          difficulty: "medium",
          tags: ["algorithms","complexity"],
          topic: "Data Structures",
        }],
      });

    expect(res.status).toBe(201);
    expect(res.body.data.inserted).toBe(1);
  });

  test("validates true-false type needs exactly 2 options", async () => {
    const app = buildBulkApp([]);

    const res = await request(app)
      .post("/api/tests/test-1/questions/bulk")
      .set("Authorization", makeJWT(ADMIN))
      .send({
        questions: [{
          question: "Is Python a compiled language statement here?",
          type: "true-false",
          options: ["True"], // only 1 option — invalid
          correct_answer: "0",
          marks: 1,
        }],
      });

    if (res.status === 201) {
      expect(res.body.data.skipped).toBeGreaterThan(0);
    } else {
      expect(res.status).toBe(422);
    }
  });
});

// ── question-detector unit tests ───────────────────────────────────────────────

describe("question-detector — detectAndParseQuestions()", () => {
  const { detectAndParseQuestions } = require("../lib/question-detector");

  test("returns empty array for empty input", () => {
    expect(detectAndParseQuestions("")).toEqual([]);
    expect(detectAndParseQuestions("   ")).toEqual([]);
    expect(detectAndParseQuestions(null)).toEqual([]);
  });

  test("detects MCQ from numbered text", () => {
    const text = [
      "1. What is the capital of France?",
      "a) London",
      "b) Paris",
      "c) Berlin",
      "d) Madrid",
      "Answer: b",
      "Marks: 2",
    ].join("\n");

    const rows = detectAndParseQuestions(text);
    expect(rows.length).toBe(1);
    expect(rows[0].type).toBe("mcq");
    expect(rows[0].options).toHaveLength(4);
    expect(rows[0].correct_answer).toBe("1"); // b → index 1
    expect(rows[0].marks).toBe(2);
  });

  test("detects True/False from options", () => {
    const text = [
      "1. The Earth orbits around the Moon.",
      "a) True",
      "b) False",
      "Answer: b",
    ].join("\n");

    const rows = detectAndParseQuestions(text);
    expect(rows[0].type).toBe("true-false");
    expect(rows[0].options).toEqual(["True", "False"]);
  });

  test("detects fill-in-blank from underscores", () => {
    const text = "1. The chemical formula for water is _____.";
    const rows = detectAndParseQuestions(text);
    expect(rows[0].type).toBe("fill-blank");
  });

  test("detects coding from keywords", () => {
    const text = [
      "1. Write a function to sort an array.",
      "Input Format: N integers",
      "Output Format: sorted integers",
      "Constraints: 1 <= N <= 1000",
    ].join("\n");

    const rows = detectAndParseQuestions(text);
    expect(rows[0].type).toBe("coding");
  });

  test("detects short answer as default", () => {
    const text = "1. What is your name?";
    const rows = detectAndParseQuestions(text);
    expect(["short","long","descriptive"]).toContain(rows[0].type);
  });

  test("extracts difficulty and topic", () => {
    const text = [
      "1. What is the time complexity of Merge Sort?",
      "a) O(n)",
      "b) O(n log n)",
      "c) O(n²)",
      "d) O(log n)",
      "Answer: b",
      "Difficulty: Hard",
      "Topic: Sorting Algorithms",
      "Marks: 3",
    ].join("\n");

    const rows = detectAndParseQuestions(text);
    expect(rows[0].difficulty).toBe("hard");
    expect(rows[0].topic).toContain("Sorting");
    expect(rows[0].marks).toBe(3);
  });

  test("handles multiple questions in one block", () => {
    const text = [
      "1. What is 1+1?",
      "a) 1",
      "b) 2",
      "c) 3",
      "d) 4",
      "Answer: b",
      "",
      "2. What is 2+2?",
      "a) 2",
      "b) 3",
      "c) 4",
      "d) 5",
      "Answer: c",
    ].join("\n");

    const rows = detectAndParseQuestions(text);
    expect(rows.length).toBe(2);
    expect(rows[0].type).toBe("mcq");
    expect(rows[1].type).toBe("mcq");
  });

  test("marks duplicate questions with error", () => {
    const same = [
      "1. What is JavaScript?",
      "a) A language",
      "b) A database",
      "c) A framework",
      "d) An OS",
      "Answer: a",
      "",
      "2. What is JavaScript?",
      "a) A language",
      "b) A database",
      "c) A framework",
      "d) An OS",
      "Answer: a",
    ].join("\n");

    const rows = detectAndParseQuestions(same);
    expect(rows.length).toBe(2);
    const dupRow = rows.find(r => r._errors.some(e => e.toLowerCase().includes("duplicate")));
    expect(dupRow).toBeTruthy();
  });
});

// ── import-parser security tests ───────────────────────────────────────────────

describe("import-parser — validateFileSecurity()", () => {
  const { parseFile } = require("../lib/import-parser");

  test("rejects unsupported extension", async () => {
    await expect(parseFile(Buffer.from("test"), "file.exe", "application/octet-stream"))
      .rejects.toThrow(/not supported/i);
  });

  test("rejects file exceeding size limit", async () => {
    const huge = Buffer.alloc(51 * 1024 * 1024); // 51 MB
    await expect(parseFile(huge, "big.csv", "text/csv"))
      .rejects.toThrow(/too large/i);
  });

  test("parses valid CSV buffer", async () => {
    const csv = "type,question,option_a,option_b,option_c,option_d,correct_answer,marks\nmcq,Test question here?,A,B,C,D,A,1";
    const result = await parseFile(Buffer.from(csv), "test.csv", "text/csv");
    expect(result.rows.length).toBe(1);
    expect(result.rows[0].type).toBe("mcq");
  });

  test("parses valid JSON buffer", async () => {
    const json = JSON.stringify([{ type: "short", question: "What is OOP programming?", marks: 2 }]);
    const result = await parseFile(Buffer.from(json), "test.json", "application/json");
    expect(result.rows.length).toBe(1);
    expect(result.rows[0].type).toBe("short");
  });

  test("returns fileError for image (OCR unavailable)", async () => {
    const png = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]); // PNG header
    const result = await parseFile(png, "image.png", "image/png");
    expect(result.fileErrors.length).toBeGreaterThan(0);
    expect(result.fileErrors[0]).toMatch(/OCR/i);
  });
});
