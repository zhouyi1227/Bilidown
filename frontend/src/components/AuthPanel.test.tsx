import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ApiClient } from "../api";
import { AuthPanel } from "./AuthPanel";

const api = {
  uploadCookies: vi.fn(),
  startQrLogin: vi.fn(),
  pollQrLogin: vi.fn(),
} as unknown as ApiClient;

afterEach(cleanup);

describe("AuthPanel", () => {
  it("shows the checked account and membership and can refresh", async () => {
    const onRefresh = vi.fn();
    render(
      <AuthPanel
        api={api}
        auth={{ kind: "browser", browser: "edge" }}
        authStatus={{ state: "active", username: "测试用户", vip_active: true, vip_label: "年度大会员" }}
        checking={false}
        checkError={null}
        autoSelected={false}
        onRefresh={onRefresh}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText("测试用户 · 年度大会员")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edge" })).toHaveClass("active");
    await userEvent.click(screen.getByRole("button", { name: "重新检查" }));
    expect(onRefresh).toHaveBeenCalledOnce();
  });

  it("shows an authentication check error without disabling source selection", () => {
    render(
      <AuthPanel
        api={api}
        auth={{ kind: "browser", browser: "chrome" }}
        authStatus={null}
        checking={false}
        checkError="无法读取浏览器 Cookie"
        autoSelected={false}
        onRefresh={vi.fn()}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText("无法读取浏览器 Cookie")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "游客" })).toBeEnabled();
  });

  it("labels a browser selected automatically", () => {
    render(
      <AuthPanel
        api={api}
        auth={{ kind: "browser", browser: "edge" }}
        authStatus={{ state: "active", username: "测试用户", vip_active: false, vip_label: null }}
        checking={false}
        checkError={null}
        autoSelected
        onRefresh={vi.fn()}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText("Edge · 自动选择")).toBeInTheDocument();
  });

  it("starts local QR login without opening an embedded browser window", async () => {
    vi.mocked(api.startQrLogin).mockResolvedValue({
      qr_key: "a".repeat(32),
      image_data_uri: "data:image/svg+xml;base64,PHN2Zy8+",
    });
    render(
      <AuthPanel
        api={api}
        auth={{ kind: "guest" }}
        authStatus={null}
        checking={false}
        checkError={null}
        autoSelected={false}
        onRefresh={vi.fn()}
        onChange={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "扫码登录 Bilibili" }));

    expect(api.startQrLogin).toHaveBeenCalledOnce();
    expect(screen.getByRole("img", { name: "Bilibili 登录二维码" })).toHaveAttribute(
      "src",
      "data:image/svg+xml;base64,PHN2Zy8+",
    );
    expect(screen.getByText("等待扫码…")).toBeInTheDocument();
  });
});
