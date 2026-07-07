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
    // navegadores modernos disparam 'cancel' ao fechar o diálogo sem escolher
    input.oncancel = () => done(null);
    // fallback: ao voltar o foco, só trata como cancelamento se NADA foi escolhido
    // (o timeout dá tempo do 'change' popular input.files em devices lentos)
    window.addEventListener(
      "focus",
      () => setTimeout(() => { if (!input.files || input.files.length === 0) done(null); }, 800),
      { once: true }
    );
    input.click();
  });
