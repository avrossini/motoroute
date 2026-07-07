// Abstração de seleção de imagem (foto de perfil). Metro resolve .web.ts / .native.ts
// por plataforma. Web usa <input type=file> (sem dependência); nativo usa expo-image-picker.
export interface PickedImage {
  uri: string; // preview local (objectURL na web, file:// no nativo)
  blob: Blob; // dados p/ upload no Storage
  mimeType: string; // ex.: "image/jpeg"
}

export interface ImagePickerPlatform {
  // null = usuário cancelou ou negou permissão
  pickImage(): Promise<PickedImage | null>;
}
