# 🧬 Protocolo Newborn

Jogo de **sobrevivência e terror (Survival Horror)** em primeira pessoa onde você controla **Arthur Vance**, preso em um complexo isolado sob ameaça constante do **Newborn**.

> 🇧🇷 **Narração completa em Português (PT-BR)** com legendas dinâmicas, respiração ofegante e batimentos cardíacos que reagem ao perigo em tempo real.

---

## 📱 Baixar o APK (Android)

O **Protocolo Newborn** usa uma arquitetura **modular e leve**:
- Você instala primeiro apenas o **APK Base** (Menu, Prólogo, Configurações e Gerenciador de Dados).
- Depois de instalado, você **baixa cada capítulo dentro do próprio jogo** (armazenados neste repositório público).
- Os capítulos baixados ficam salvos no celular para jogar **100% offline** e você pode **excluir os dados de qualquer fase** em *Configurações* quando quiser liberar espaço.

### 🔗 Links de Download
- ⬇️ **[Baixar Última Versão do APK (`Protocolo-Newborn.apk`)](https://github.com/Dracko8891/Protocolo-Newborn/releases/download/apk-latest/Protocolo-Newborn.apk)**
- 📦 **[Ver todas as versões e pacotes de fases (Releases)](https://github.com/Dracko8891/Protocolo-Newborn/releases)**

### 📲 Como instalar no Android
1. Baixe o arquivo `Protocolo-Newborn.apk` pelo link acima no seu celular ou tablet.
2. Toque no arquivo baixado para iniciar a instalação.
3. Se o Android pedir permissão, ative **"Permitir instalação de fontes desconhecidas"** para o seu navegador/gerenciador de arquivos.
4. Abra o jogo, entre no **Seletor de Fases** e baixe o Capítulo 1 para começar. *(Necessário conexão com a internet apenas na hora de baixar cada fase).*

---

## 🕹️ Como Jogar e Sobreviver

### Objetivo
Explore cada setor da instalação, sobreviva às patrulhas do **Newborn** e destranque a comporta de saída:
1. **Procure Suprimentos:** Colete **Kits de Estanca** (para curar ferimentos e parar o sangramento) e o **Crachá / Cartão de Acesso** do setor.
2. **Descubra a Senha (PIN):** Abra o **PADD** e gire o crachá coletado para revelar o código PIN da comporta.
3. **Restaure a Energia:** Encontre o **Painel de Relés** e ligue a energia auxiliar *(cuidado com curto-circuito no canal vermelho!)*.
4. **Fuja pela Comporta:** Insira o PIN correto na Comporta Norte e escape antes que a criatura encontre você.

### ⚠️ Dicas de Sobrevivência
- **Silêncio e Furtividade:** Barulhos e rastros de sangue colocam o Newborn em estado de alerta (*Investigate*) ou perseguição direta (*Hunt*).
- **Armários de Aço:** Esconda-se nos armários quando a criatura estiver por perto — mas fique de olho no seu **fôlego** para não ficar sem ar!
- **Lanterna:** Controle o uso da lanterna; se a bateria chegar perto de `0%`, você ficará no escuro.

---

## 🎮 Controles

### Celular e Tablet (Touch)
- **Lado Esquerdo:** Joystick virtual para movimentação + botão de corrida.
- **Lado Direito:** Arraste na área livre para girar a câmera + botões táticos (Interagir, Agachar/Esconder, Lanterna, Tricorder, Dínamo, PADD e Pausa).
- **Orientação de Tela:** Padrão em **Modo Paisagem (horizontal)**, adaptando-se automaticamente para **Modo Vertical** com compensação de campo de visão caso você segure o aparelho em pé.

### Computador (PC / Navegador)
- **W A S D / Setas:** Movimentação
- **Mouse:** Girar câmera / Interagir nos painéis
- **Teclas de Atalho:** `F` (Interagir/Armário), `L` (Lanterna), `T` (Tricorder), `C` (Agachar), `R` (Dínamo), `H` (Kit de Estanca), `Tab` (PADD) e `Esc`/`P` (Pausa).

---

## 🗂️ Capítulos Disponíveis (Fases Modulares)

| Capítulo | Setor | Pacote |
| :--- | :--- | :--- |
| **Cap. 1** | Ala Médica | `fase_01.zip` |
| **Cap. 2** | Átrio Frio | `fase_02.zip` |
| **Cap. 3** | Alojamentos | `fase_03.zip` |
| **Cap. 4** | Bio-Tanques | `fase_04.zip` |
| **Cap. 5** | Engenharia | `fase_05.zip` |
| **Cap. 6** | Bloco Ômega | `fase_06.zip` |
| **Cap. 7** | Hangar | `fase_07.zip` |

---

## ⚙️ Configurações e Acessibilidade
Dentro do menu **Configurações · Dados** você pode ajustar:
- Volume da **Narração**;
- Ligar/desligar **Legendas**, ajustar o tamanho do texto e ativar voz sintética PT-BR de fallback;
- Modo de controles (`Auto`, `Touch` ou `Teclado`);
- **Gerenciador de Dados:** visualizar quanto espaço cada capítulo ocupa no celular e apagar os dados das fases já concluídas.

---

## 🛠️ Tecnologias & Automação
- **Engine / Frontend:** React, TypeScript e Three.js (empacotado para Android via WebView nativo em Kotlin).
- **Áudio & Narração:** Sistema próprio (`NarrationManager`) com prioridade emocional, *audio ducking* e suporte a geração de vozes em PT-BR via scripts em `scripts/` (`edge-tts` em CPU e `Chatterbox_Colab.ipynb` em GPU).
- **CI/CD (GitHub Actions):**
  - Compilação automática do APK Android e publicação em `apk-latest` (`Protocolo-Newborn.apk`);
  - Empacotamento e publicação automática das fases (`fase_01.zip` a `fase_07.zip`) na release `levels-v1.0.0`.
