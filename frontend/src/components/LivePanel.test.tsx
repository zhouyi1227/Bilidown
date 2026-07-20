import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { LiveJobView } from "../api";
import { LivePanel } from "./LivePanel";

const job: LiveJobView = {
  id: "live-1",
  status: "recording",
  request: {
    credential: "https://live.bilibili.com/123",
    quality_height: 1080,
    auth: { kind: "guest" },
    output_dir: "C:\\Downloads",
  },
  result_paths: [],
  error_code: null,
  error_message: null,
  created_at: "2026-07-20T00:00:00Z",
  updated_at: "2026-07-20T00:00:01Z",
};

describe("LivePanel", () => {
  it("offers distinct save and delete stop actions", async () => {
    const onStop = vi.fn();
    const onCancel = vi.fn();
    render(
      <LivePanel
        jobs={[job]}
        outputDir={job.request.output_dir}
        qualityHeight={1080}
        busy={false}
        onOutputDirChange={vi.fn()}
        onQualityHeightChange={vi.fn()}
        onStart={vi.fn()}
        onStop={onStop}
        onCancel={onCancel}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "停止并保留" }));
    await userEvent.click(screen.getByRole("button", { name: "取消并删除" }));

    expect(onStop).toHaveBeenCalledWith(job.id);
    expect(onCancel).toHaveBeenCalledWith(job.id);
  });
});
