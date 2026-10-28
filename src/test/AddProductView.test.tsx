import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import AddProductView from "@/components/AddProductView";
import { invokeFunction } from "@/lib/api";
import { toast } from "sonner";

vi.mock("@/lib/api", () => ({ invokeFunction: vi.fn() }));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const invokeMock = vi.mocked(invokeFunction);

describe("AddProductView - campo tipo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem("estoque_pro_token", "test-token");
  });

  const fillForm = () => {
    fireEvent.change(screen.getByPlaceholderText("Código de barras (EAN)"), {
      target: { value: "1234567890123" },
    });
    fireEvent.change(screen.getByPlaceholderText("Código interno"), {
      target: { value: "123" },
    });
    fireEvent.change(screen.getByPlaceholderText("DESCRIÇÃO DO PRODUTO"), {
      target: { value: "TESTE KG" },
    });
  };

  const setupInvoke = () => {
    invokeMock.mockImplementation((async (_fn: unknown, opts: any) => {
      if (opts?.body?.action === "check") return { data: { exists: false }, error: null };
      if (opts?.body?.action === "insert")
        return { data: { success: true, action: "created" }, error: null };
      return { data: {}, error: null };
    }) as any);
  };

  it("renders Tipo select with default UN", () => {
    const { container } = render(<AddProductView />);
    expect(screen.getByText("Tipo")).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveTextContent("UN");
    const nativeSelect = container.querySelector("select") as HTMLSelectElement;
    expect(nativeSelect).not.toBeNull();
    expect(nativeSelect.value).toBe("un");
  });

  it("submits tipo=kg when KG is selected and resets to UN after success", async () => {
    setupInvoke();
    const { container } = render(<AddProductView />);
    const nativeSelect = container.querySelector("select") as HTMLSelectElement;

    fireEvent.change(nativeSelect, { target: { value: "kg" } });
    expect(screen.getByRole("combobox")).toHaveTextContent("KG");

    fillForm();
    fireEvent.click(screen.getByRole("button", { name: "Adicionar Produto" }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(
        "query-product",
        expect.objectContaining({
          body: expect.objectContaining({ action: "insert", tipo: "kg" }),
        })
      );
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalled();
    });
    expect((container.querySelector("select") as HTMLSelectElement).value).toBe("un");
  });

  it("submits tipo=un by default", async () => {
    setupInvoke();
    render(<AddProductView />);
    fillForm();
    fireEvent.click(screen.getByRole("button", { name: "Adicionar Produto" }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(
        "query-product",
        expect.objectContaining({
          body: expect.objectContaining({ action: "insert", tipo: "un" }),
        })
      );
    });
  });
});
