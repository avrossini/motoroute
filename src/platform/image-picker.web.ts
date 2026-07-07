import type { ImagePickerPlatform, PickedImage } from "./image-picker";

// Web: <input type=file> temporário. O diálogo nativo não dispara 'change' ao
// cancelar → detectamos o cancelamento quando a janela recupera o foco.
export const pickImage: ImagePickerPlatform["pickImage"] = () =>
  new Promise<PickedImage | null>((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    let settled = false;
    const done = (v: PickedImage | null) => {
      if (settled) return;
      settled = true;
      resolve(v);
    };
    input.onchange = () => {
      const file = input.files?.[0];
      done(
        file
          ? { uri: URL.createObjectURL(file), blob: file, mimeType: file.type || "image/jpeg" }
          : null
      );
    };
    // se 'change' não disparar até logo após o foco voltar, tratamos como cancelamento
    window.addEventListener("focus", () => setTimeout(() => done(null), 600), { once: true });
    input.click();
  });
