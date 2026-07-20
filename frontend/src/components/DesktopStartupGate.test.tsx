import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DesktopStartupGate } from "./DesktopStartupGate";
import {
  getBackendConnection,
  quitDesktopApp,
  reloadDesktopApp,
  retryBackend,
} from "../desktop";

vi.mock("../desktop", () => ({
  getBackendConnection: vi.fn(),
  isDesktopApp: () => true,
  quitDesktopApp: vi.fn(),
  reloadDesktopApp: vi.fn(),
  retryBackend: vi.fn(),
}));

const connection = { base_url: "http://127.0.0.1:39567", token: "test-token" };

describe("DesktopStartupGate", () => {
  beforeEach(() => {
    vi.mocked(getBackendConnection).mockReset();
    vi.mocked(quitDesktopApp).mockReset();
    vi.mocked(reloadDesktopApp).mockReset();
    vi.mocked(retryBackend).mockReset();
  });

  it("shows the application after the backend becomes ready", async () => {
    vi.mocked(getBackendConnection).mockResolvedValue(connection);
    render(<DesktopStartupGate><p>application ready</p></DesktopStartupGate>);

    expect(screen.getByText("Bilidown 正在启动")).toBeInTheDocument();
    expect(await screen.findByText("application ready")).toBeInTheDocument();
  });

  it("offers retry and quit after startup fails", async () => {
    vi.mocked(getBackendConnection)
      .mockRejectedValueOnce(new Error("backend_start_failed"))
      .mockResolvedValueOnce(connection);
    vi.mocked(retryBackend).mockResolvedValue({ state: "starting", error_code: null });
    render(<DesktopStartupGate><p>application ready</p></DesktopStartupGate>);

    expect(await screen.findByText("本地后端启动失败")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "彻底退出" }));
    expect(quitDesktopApp).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "重试启动" }));
    await waitFor(() => expect(retryBackend).toHaveBeenCalledOnce());
    await waitFor(() => expect(reloadDesktopApp).toHaveBeenCalledOnce());
  });
});
