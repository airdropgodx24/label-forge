import { describe, expect, it } from "vitest";
import {
  RECORD_COLUMNS,
  buildExport,
  buildRecords,
  csvCell,
  exportFileName,
  recordsToCsv,
  recordsToJsonl,
  slugify,
  summaryToCsv,
  summaryToJson,
} from "../src/export";
import type { Job, Label, TaskType } from "../src/types";
import { abType } from "./helpers";

const job: Job = {
  id: "job-1",
  name: "Street Scenes: Round 2",
  taskTypeId: "test",
  createdAt: "2026-11-24T09:00:00.000Z",
};
const exportedAt = new Date("2026-11-24T12:00:00.000Z");
const T = "2026-11-24T10:00:00.000Z";

function labels<V>(pass: 1 | 2, who: string, pairs: Array<[string, V]>): Label<V>[] {
  return pairs.map(([taskId, value], i) => ({
    taskId,
    labelerName: who,
    pass,
    value,
    createdAt: `2026-11-24T10:0${i}:00.000Z`,
  }));
}

/**
 * Fixture used by most tests (Image-Preference-like, labels are "A" or "B"):
 *
 *   task  Pass 1 (Ada)  Pass 2 (Grace)  status
 *   t1    A             A               agreed
 *   t2    B             A               disagreed
 *   t3    A             -               single_pass
 *
 * Double-labeled: t1, t2. Agreed 1 of 2 = 50%.
 * Kappa: pairs AA, BA. Pass 1 has A=1, B=1; Pass 2 has A=2, B=0.
 * p_o = 0.5, p_e = (1*2 + 1*0)/4 = 0.5, kappa = (0.5 - 0.5) / 0.5 = 0.
 */
const pass1 = labels(1, "Ada", [["t1", "A"], ["t2", "B"], ["t3", "A"]]);
const pass2 = labels(2, "Grace", [["t1", "A"], ["t2", "A"]]);
const input = { job, taskType: abType, pass1, pass2, exportedAt };

describe("records (FR-E1, FR-E3, FR-E4)", () => {
  const { records, report } = buildRecords(input);

  it("makes one record per finished label, Pass 1 first then Pass 2", () => {
    expect(records.map((r) => `${r.pass}:${r.taskId}`)).toEqual(["1:t1", "1:t2", "1:t3", "2:t1", "2:t2"]);
  });

  it("carries every field of the shared record shape", () => {
    expect(records[1]).toEqual({
      jobId: "job-1",
      taskId: "t2",
      taskType: "test",
      labeler: "Ada",
      pass: 1,
      label: "B",
      labeledAt: "2026-11-24T10:01:00.000Z",
      agreementStatus: "disagreed",
      exportedAt: "2026-11-24T12:00:00.000Z",
    });
    expect(Object.keys(records[0]!)).toEqual([...RECORD_COLUMNS]);
  });

  it("marks agreed, disagreed and single_pass per task, the same on both passes", () => {
    const status = (pass: number, id: string) =>
      records.find((r) => r.pass === pass && r.taskId === id)?.agreementStatus;
    expect(status(1, "t1")).toBe("agreed");
    expect(status(2, "t1")).toBe("agreed");
    expect(status(1, "t2")).toBe("disagreed");
    expect(status(2, "t2")).toBe("disagreed");
    expect(status(1, "t3")).toBe("single_pass");
  });

  it("returns the agreement report the statuses came from", () => {
    expect(report).toMatchObject({ totalDoubleLabeled: 2, agreedCount: 1, percentAgreement: 50 });
    expect(report.kappa).toBeCloseTo(0, 10);
    expect(report.disagreements.map((d) => d.taskId)).toEqual(["t2"]);
  });

  it("leaves out labels the task type does not call finished", () => {
    const p1 = [...pass1, ...labels(1, "Ada", [["t4", "unfinished"]]).map((l) => ({ ...l }))];
    const p2 = [...pass2, ...labels(2, "Grace", [["t4", "A"]])];
    const built = buildRecords({ ...input, pass1: p1, pass2: p2 });
    // t4 has a finished label in Pass 2 only, so it is single_pass, and the unfinished Pass 1 label is gone.
    expect(built.records.filter((r) => r.taskId === "t4").map((r) => [r.pass, r.agreementStatus])).toEqual([
      [2, "single_pass"],
    ]);
    expect(built.report.totalDoubleLabeled).toBe(2);
  });

  it("gives an empty export, not an error, when nothing is labeled", () => {
    const built = buildRecords({ ...input, pass1: [], pass2: [] });
    expect(built.records).toEqual([]);
    expect(recordsToJsonl(built.records)).toBe("");
  });

  it("has the same fields whatever the task type (FR-E3); only the label content differs", () => {
    const ranking: Pick<TaskType<unknown, string[]>, "id" | "isComplete" | "labelsAgree"> = {
      id: "response-ranking",
      isComplete: (l) => l.value.length > 0,
      labelsAgree: (a, b) => a.value[0] === b.value[0],
    };
    const ranked = buildRecords({
      job,
      taskType: ranking,
      pass1: labels(1, "Ada", [["t1", ["r2", "r1", "r3"]]]),
      pass2: [],
      exportedAt,
    }).records[0]!;
    expect(Object.keys(ranked)).toEqual(Object.keys(records[0]!));
    expect(ranked.taskType).toBe("response-ranking");
    expect(ranked.label).toEqual(["r2", "r1", "r3"]);
  });
});

describe("JSONL (FR-E1)", () => {
  it("writes exactly one JSON object per line, newline terminated", () => {
    const { records } = buildRecords(input);
    const text = recordsToJsonl(records);
    expect(text.endsWith("\n")).toBe(true);
    const lines = text.trimEnd().split("\n");
    expect(lines).toHaveLength(5);
    expect(lines.map((l) => JSON.parse(l))).toEqual(records);
  });

  it("matches the expected line for a record", () => {
    const { records } = buildRecords(input);
    expect(recordsToJsonl(records).split("\n")[0]).toBe(
      '{"jobId":"job-1","taskId":"t1","taskType":"test","labeler":"Ada","pass":1,"label":"A",' +
        '"labeledAt":"2026-11-24T10:00:00.000Z","agreementStatus":"agreed","exportedAt":"2026-11-24T12:00:00.000Z"}',
    );
  });

  it("keeps ranking labels as real arrays and text exactly as typed", () => {
    const { records } = buildRecords({
      job,
      taskType: {
        id: "response-ranking",
        isComplete: () => true,
        labelsAgree: (a: Label<string[]>, b: Label<string[]>) => a.value[0] === b.value[0],
      },
      pass1: labels(1, '=Ada, "the\nlabeler"', [["t1", ["r2", "r1"]]]),
      pass2: [],
      exportedAt,
    });
    const parsed = JSON.parse(recordsToJsonl(records));
    expect(parsed.label).toEqual(["r2", "r1"]);
    expect(parsed.labeler).toBe('=Ada, "the\nlabeler"');
  });
});

describe("CSV (FR-E2)", () => {
  it("writes a header row and one row per record, with CRLF line ends", () => {
    const { records } = buildRecords(input);
    const lines = recordsToCsv(records).split("\r\n");
    expect(lines[0]).toBe(
      "jobId,taskId,taskType,labeler,pass,label,labeledAt,agreementStatus,exportedAt",
    );
    expect(lines[1]).toBe(
      "job-1,t1,test,Ada,1,A,2026-11-24T10:00:00.000Z,agreed,2026-11-24T12:00:00.000Z",
    );
    expect(lines[3]).toBe(
      "job-1,t3,test,Ada,1,A,2026-11-24T10:02:00.000Z,single_pass,2026-11-24T12:00:00.000Z",
    );
    expect(lines).toHaveLength(5 + 2); // header + 5 rows + the empty piece after the last CRLF
    expect(lines.at(-1)).toBe("");
  });

  it("has the same columns, in the same order, as the JSONL keys", () => {
    const { records } = buildRecords(input);
    expect(recordsToCsv(records).split("\r\n")[0]!.split(",")).toEqual(Object.keys(JSON.parse(recordsToJsonl(records).split("\n")[0]!)));
  });

  it("is just the header for an empty export", () => {
    expect(recordsToCsv([])).toBe("jobId,taskId,taskType,labeler,pass,label,labeledAt,agreementStatus,exportedAt\r\n");
  });

  it("quotes cells with commas, quotes and line breaks, and doubles inner quotes", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("two\nlines")).toBe('"two\nlines"');
    expect(csvCell("cr\rhere")).toBe('"cr\rhere"');
  });

  it("writes a ranking label as JSON text in one cell", () => {
    expect(csvCell(["r2", "r1", "r3"])).toBe('"[""r2"",""r1"",""r3""]"');
  });

  it("writes numbers, booleans and empty values plainly", () => {
    expect(csvCell(3)).toBe("3");
    expect(csvCell(-1.5)).toBe("-1.5");
    expect(csvCell(false)).toBe("false");
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });

  it("defuses text a spreadsheet would run as a formula", () => {
    expect(csvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("-1")).toBe("'-1"); // a string, unlike the number -1
    expect(csvCell("@cmd")).toBe("'@cmd");
    expect(csvCell("\t=x")).toBe("'\t=x");
    expect(csvCell("Ada =not a formula")).toBe("Ada =not a formula");
  });

  it("applies that to labeler names in the label file", () => {
    const { records } = buildRecords({ ...input, pass1: labels(1, "=HYPERLINK(1)", [["t1", "A"]]), pass2: [] });
    expect(recordsToCsv(records).split("\r\n")[1]!.startsWith("job-1,t1,test,'=HYPERLINK(1),")).toBe(true);
  });
});

describe("agreement summary as JSON", () => {
  const { report } = buildRecords(input);
  const doc = JSON.parse(summaryToJson(report, "2026-11-24T12:00:00.000Z"));

  it("holds percent agreement, kappa, counts and the disagreement list", () => {
    expect(doc).toEqual({
      jobId: "job-1",
      exportedAt: "2026-11-24T12:00:00.000Z",
      totalDoubleLabeled: 2,
      agreedCount: 1,
      percentAgreement: 50,
      kappa: 0,
      disagreements: [
        {
          taskId: "t2",
          pass1: { labeler: "Ada", label: "B", labeledAt: "2026-11-24T10:01:00.000Z" },
          pass2: { labeler: "Grace", label: "A", labeledAt: "2026-11-24T10:01:00.000Z" },
        },
      ],
    });
  });

  it("writes null, not a number, when kappa or percent agreement is undefined", () => {
    const empty = buildRecords({ ...input, pass1: [], pass2: [] }).report;
    const out = JSON.parse(summaryToJson(empty, "x"));
    expect(out.kappa).toBeNull();
    expect(out.percentAgreement).toBeNull();
    expect(out.disagreements).toEqual([]);
  });

  it("matches the hand-computed kappa of 8/23 for a larger example", () => {
    // Same 10-task example as the scorer tests: AA x5, AB, BA x2, BB x2.
    const codes = [...Array(5).fill("AA"), "AB", "BA", "BA", "BB", "BB"] as string[];
    const p1 = labels(1, "Ada", codes.map((c, i) => [`t${i}`, c[0]!] as [string, string]));
    const p2 = labels(2, "Grace", codes.map((c, i) => [`t${i}`, c[1]!] as [string, string]));
    const out = JSON.parse(summaryToJson(buildRecords({ ...input, pass1: p1, pass2: p2 }).report, "x"));
    expect(out.percentAgreement).toBeCloseTo(70, 10);
    expect(out.kappa).toBeCloseTo(8 / 23, 10);
    expect(out.disagreements).toHaveLength(3);
  });
});

describe("agreement summary as CSV", () => {
  it("has summary rows for the four numbers and a row per disagreement", () => {
    const { report } = buildRecords(input);
    expect(summaryToCsv(report)).toBe(
      [
        "row,name,value,taskId,pass1Labeler,pass1Label,pass2Labeler,pass2Label",
        "summary,totalDoubleLabeled,2,,,,,",
        "summary,agreedCount,1,,,,,",
        "summary,percentAgreement,50,,,,,",
        "summary,kappa,0,,,,,",
        "disagreement,,,t2,Ada,B,Grace,A",
        "",
      ].join("\r\n"),
    );
  });

  it("keeps the summary rows, with empty values, when nothing was double-labeled", () => {
    const { report } = buildRecords({ ...input, pass1: [], pass2: [] });
    const lines = summaryToCsv(report).split("\r\n");
    expect(lines.slice(1, 5)).toEqual([
      "summary,totalDoubleLabeled,0,,,,,",
      "summary,agreedCount,0,,,,,",
      "summary,percentAgreement,,,,,,",
      "summary,kappa,,,,,,",
    ]);
    expect(lines.filter((l) => l.startsWith("disagreement"))).toEqual([]);
  });

  it("writes ranking labels as JSON text and escapes names", () => {
    const { report } = buildRecords({
      job,
      taskType: {
        id: "response-ranking",
        isComplete: () => true,
        labelsAgree: (a: Label<string[]>, b: Label<string[]>) => a.value[0] === b.value[0],
      },
      pass1: labels(1, "Ada, A.", [["t1", ["r1", "r2"]]]),
      pass2: labels(2, "Grace", [["t1", ["r2", "r1"]]]),
      exportedAt,
    });
    expect(summaryToCsv(report).split("\r\n")[5]).toBe(
      'disagreement,,,t1,"Ada, A.","[""r1"",""r2""]",Grace,"[""r2"",""r1""]"',
    );
  });
});

describe("file names (FR-E4)", () => {
  it("slugifies the job name", () => {
    expect(slugify("Street Scenes: Round 2")).toBe("street-scenes-round-2");
    expect(slugify("  Café   ñandú!! ")).toBe("cafe-nandu");
    expect(slugify("../../etc/passwd")).toBe("etc-passwd");
    expect(slugify("???")).toBe("job");
    expect(slugify("")).toBe("job");
  });

  it("carries the job name and the UTC export date", () => {
    expect(exportFileName("Street Scenes", exportedAt, "", "csv")).toBe("street-scenes-2026-11-24.csv");
    expect(exportFileName("Street Scenes", "2026-11-24T23:59:59.000Z", "-agreement", "json")).toBe(
      "street-scenes-2026-11-24-agreement.json",
    );
  });
});

describe("buildExport: the four downloadable files", () => {
  const bundle = buildExport(input);

  it("names and types each file", () => {
    const { labelsJsonl, labelsCsv, agreementJson, agreementCsv } = bundle.files;
    expect([labelsJsonl, labelsCsv, agreementJson, agreementCsv].map((f) => [f.name, f.mimeType])).toEqual([
      ["street-scenes-round-2-2026-11-24.jsonl", "application/x-ndjson"],
      ["street-scenes-round-2-2026-11-24.csv", "text/csv"],
      ["street-scenes-round-2-2026-11-24-agreement.json", "application/json"],
      ["street-scenes-round-2-2026-11-24-agreement.csv", "text/csv"],
    ]);
  });

  it("fills them from the same records and report", () => {
    expect(bundle.files.labelsJsonl.content).toBe(recordsToJsonl(bundle.records));
    expect(bundle.files.labelsCsv.content).toBe(recordsToCsv(bundle.records));
    expect(JSON.parse(bundle.files.agreementJson.content).percentAgreement).toBe(50);
    expect(bundle.files.agreementCsv.content).toContain("summary,percentAgreement,50,");
  });

  it("stamps every record and the summary with one export time", () => {
    expect(new Set(bundle.records.map((r) => r.exportedAt))).toEqual(new Set(["2026-11-24T12:00:00.000Z"]));
    expect(JSON.parse(bundle.files.agreementJson.content).exportedAt).toBe("2026-11-24T12:00:00.000Z");
  });
});
