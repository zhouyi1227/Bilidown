import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ResolvedResource } from "../api";
import { ResourcePreview } from "./ResourcePreview";

const resource: ResolvedResource = {
  canonical_url: "https://www.bilibili.com/bangumi/play/ss4349",
  kind: "bangumi",
  title: "测试番剧",
  uploader: null,
  thumbnail: "https://i0.hdslb.com/cover.jpg",
  items: [
    {
      index: 1,
      id: "1",
      url: "https://www.bilibili.com/bangumi/play/ep1",
      title: "第一集",
      uploader: null,
      duration: 1200,
      thumbnail: "https://i0.hdslb.com/episode.jpg",
      selected: true,
      live: false,
      branch: false,
    },
  ],
  total_items: 1,
  truncated: false,
  experimental: false,
  warnings: [],
  video: null,
};

describe("ResourcePreview", () => {
  it("renders covers without a referrer", () => {
    render(
      <ResourcePreview
        resource={resource}
        selectedItems={new Set([1])}
        onSelectedItemsChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("img", { name: "测试番剧 封面" })).toHaveAttribute(
      "referrerpolicy",
      "no-referrer",
    );
    expect(screen.getByText("第一集")).toBeInTheDocument();
    expect(screen.getByText("20:00")).toBeInTheDocument();
  });
});
