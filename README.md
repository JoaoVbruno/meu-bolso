# Meu Bolso

App (PWA) para Android: contas fixas, quanto sobra para lazer, consultor de compras, planos e previsão.
Os dados ficam só no celular. Não há servidor nem login.

## Instalar o APK no Android

1. No celular, abra https://github.com/JoaoVbruno/meu-bolso/releases/latest/download/meu-bolso.apk
2. Abra o arquivo baixado. Na primeira vez, o Android pede para permitir instalar apps desta fonte (Chrome ou Arquivos): permita.
3. Toque em **Instalar**. Se aparecer o aviso do Play Protect, toque em **Mais detalhes → Instalar mesmo assim**.

Atualizações instalam por cima e mantêm os dados, desde que o APK seja assinado com a mesma chave.
A partir da 1.0.2, o próprio app avisa quando há versão nova (Início ou Configurações → Versão) e baixa e abre o instalador.
O número da release (`v1.0.N`) precisa ser igual ao `versionCode` N do `android/app/build.gradle`.

### Gerar o APK neste PC

Requisitos: Node, Java 17 e Android SDK (platform 34, build-tools 34.0.0).

```
npm install
npm run build:web
npx cap add android          # só na primeira vez
node tools/make-icons.mjs --android
npx cap sync android
cd android && gradlew.bat assembleRelease
```

Depois alinhe e assine `android/app/build/outputs/apk/release/app-release-unsigned.apk` com `zipalign` e `apksigner`, usando a chave em `chave-android/` (fora do repositório).
Antes de cada versão nova, aumente `versionCode` em `android/app/build.gradle`.

## Versão web (PWA)

O Android só instala a versão web a partir de um endereço `https://`. Escolha uma opção:

**Netlify Drop (mais simples, grátis)**
1. Abra https://app.netlify.com/drop no computador e crie uma conta.
2. Arraste a pasta `controle-financeiro` para a página.
3. Abra o endereço gerado no Chrome do Android.
4. Toque em **Instalar** no topo do app, ou no menu ⋮ → **Instalar app**.

**GitHub Pages**
1. Crie um repositório e envie o conteúdo desta pasta.
2. Settings → Pages → Branch `main`, pasta `/ (root)`.
3. Abra `https://<seu-usuario>.github.io/<repositorio>/` no Chrome do Android e instale.

## Testar no computador

```
npx http-server@14.1.1 controle-financeiro -p 5173 -c-1
```

Abra http://localhost:5173.

## Nubank

O Nubank não tem API pública para pessoa física. O app importa os arquivos que o próprio app do Nubank exporta:

- **Fatura do cartão (CSV):** Cartão de crédito → Faturas → escolha a fatura → Exportar.
- **Extrato da conta (CSV ou OFX):** Conta → Extrato → Exportar.

Na importação, o app ignora pagamentos de fatura, entradas e Caixinhas. Classifica cada gasto por palavras-chave,
reconhece contas fixas pelo campo "Como aparece no extrato" e marca a conta como paga. Também prevê as próximas
parcelas de compras parceladas ("Parcela 1/3").

## Como os números são calculados

- **Livre para lazer** = renda − contas fixas − variáveis essenciais previstas − (maior valor entre a meta de poupança e o que vai para os planos) − gastos de lazer já feitos.
- **Cartão:** a compra entra no mês em que a fatura vence. Comprou no dia do fechamento ou depois? Vai para a fatura seguinte.
- **Contas fixas:** todo mês, uma vez por ano (ex.: IPVA em abril, à vista ou em N vezes) ou parcelada (ex.: carro em 72x, com data de término).
- **Planos:** cada mês, a capacidade é a meta de poupança mais uma fatia (ajustável) do que sobraria para lazer.
  Os planos de prioridade alta recebem primeiro. Dentro da mesma prioridade, recebe primeiro o de prazo mais curto.
  Cada plano pede o que falta dividido pelos meses até o prazo.
- **Consultor:** simula a compra nos meses em que ela será paga. Avisa se algum mês fica negativo.
  Sugere esperar o fechamento do cartão, parcelar sem juros ou adiar.

## Backup

Engrenagem → **Baixar backup** gera um `.json`. Faça backup antes de trocar de celular ou limpar os dados do navegador.

## Ao alterar o código

Suba a versão de `CACHE` em `sw.js`. Assim o celular baixa a versão nova.
