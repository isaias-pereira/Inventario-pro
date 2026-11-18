# picomatch 4.0.8 (vendorizado)

Cópia do **picomatch 4.0.7** com o patch do PR
[micromatch/picomatch#194](https://github.com/micromatch/picomatch/pull/194)
("fix: treat a leading `?` in an extglob body as a wildcard"), que corrige o
ReDoS **CVE-2026-112366 / GHSA-fc5q-39xc-vjpf**.

O advisory não lista versão corrigida e o npm não tem release com a correção
(a última publicada é a 4.0.7, vulnerável). Por isso o pacote é vendorizado e
consumido pelo `overrides` do `package.json`:

```json
"overrides": {
  "picomatch": "file:vendor/picomatch"
}
```

- **Origem:** <https://github.com/micromatch/picomatch/tree/7be3276fb8bd215a8c73fa066bcaf696c244ad88>
- **Base:** 4.0.7 (`lib/parse.js` é o único arquivo alterado pelo PR #194).
- **Versão:** marcada como `4.0.8` para o `npm audit` reconhecer a correção; o
  código é o 4.0.7 + PR #194 (o PR ainda estava aberto quando foi vendorizado).
- **Escopo:** dependência apenas de build/dev (Vite, Vitest, Tailwind,
  workbox, micromatch). Não entra no bundle do cliente nem nas Functions.
- **Manutenção:** quando o upstream publicar a versão corrigida, apague esta
  pasta, remova o override e rode `npm install` (a versão do npm assume).
- **Teste:** `src/test/picomatch-seguranca.test.ts` cobre os padrões do
  advisory e o comportamento de extglob que o patch corrige.
