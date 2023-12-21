import dts from 'bun-plugin-dts';

await Bun.build({
  entrypoints: ['./index.ts'],
  outdir: './dist',
  sourcemap: 'external',
  minify: true,
  plugins: [
    dts()
  ],
})

const text = await Bun.file('./dist/index.d.ts').text()
Bun.write('./dist/index.d.ts', text)