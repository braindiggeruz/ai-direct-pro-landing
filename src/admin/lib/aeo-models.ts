export const modelName = (model: string) => ({
  "minimax/minimax-m3:free": "MiniMax M3",
  "nvidia/nemotron-3-super-120b-a12b:free": "NVIDIA Nemotron 3 Super",
  "dots-studio/dots-3-note-preview:free": "Dots 3 Note",
}[model] || model.replace(/:free$/, ""));
