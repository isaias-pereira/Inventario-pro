# Assinatura de e-mail

A arte original da assinatura está em `assinatura.png` (400×170 px). Ela entra
**idêntica** no fim dos e-mails de rebaixa.

## Como está configurado em produção

```
EMAIL_SIGNATURE_IMAGE_URL=https://inventario-pro-one.vercel.app/assinatura/assinatura.png
EMAIL_SIGNATURE_PARTNER=OFER TOPERA
EMAIL_SIGNATURE_EMAIL=isaiassilva@comper.com.br
```

## Para trocar a arte

1. Substitua o arquivo `assinatura.png` (mesmo nome, mesmas dimensões).
2. Publique (o arquivo é servido pelo próprio app em `/assinatura/assinatura.png`).
3. Se quiser forçar a atualização no cache, acrescente `?v=2` no fim da
   `EMAIL_SIGNATURE_IMAGE_URL`.

## Sem a arte

Se `EMAIL_SIGNATURE_IMAGE_URL` não estiver definida, o sistema monta a
assinatura em HTML (contato à esquerda, marca da empresa e selo
"Empresa Certificada" à direita). Nesse modo, as logos reais também podem ser
usadas com `EMAIL_SIGNATURE_LOGO_URL` e `EMAIL_SIGNATURE_PARTNER_LOGO_URL`.

