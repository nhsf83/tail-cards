export function downloadText(fileName: string, text: string, type = 'text/markdown;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function readFiles(accept: string, multiple = true): Promise<{ name: string; text: string }[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.onchange = async () => {
      const files = [...(input.files ?? [])];
      resolve(await Promise.all(files.map(async (f) => ({ name: f.name, text: await f.text() }))));
    };
    input.click();
  });
}
