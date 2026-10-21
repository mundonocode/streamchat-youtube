# 📱 StreamChat Mobile - Chat & Estatísticas do YouTube

Aplicação web ultra-leve desenvolvida especialmente para streamers que precisam acompanhar o **chat ao vivo** e as **estatísticas de visualizações/likes** pelo navegador do celular, sem sobrecarregar o computador e **sem gastar a banda de internet** consumindo o fluxo de vídeo da live.

---

## ⚡ Por que essa solução é ideal para a sua live?

1. **Zero Vídeo (100% Economia de Banda)**:
   - Não reproduz o player do YouTube no celular.
   - Puxa apenas texto e dados JSON via WebSocket, consumindo menos de 0.1% dos dados de um vídeo.
   - Sua live não sofre perda de quadros (frame drops) nem lentidão na rede.

2. **Detecção Automática de Live**:
   - Basta informar seu canal (ex: `@SeuCanal`).
   - A aplicação monitora e, assim que você entrar ao vivo, o chat e as estatísticas aparecem instantaneamente no celular.

3. **Painel de Estatísticas Fixo no Topo**:
   - 👥 **Viewers em tempo real** (espectadores simultâneos).
   - 👍 **Likes acumulados**.
   - 💬 **Contador de mensagens** recebidas.
   - ⏱️ **Cronômetro de duração da transmissão**.

4. **Chat Otimizado para Leitura do Streamer**:
   - Destaque vibrante para **Super Chats** (valor e cor).
   - Badges para **Moderadores**, **Membros** e **Dono da Live**.
   - Emojis nativos e customizados do YouTube.
   - Rolagem automática inteligente (se você rolar para cima para ler algo, ela não força a tela para baixo até você clicar em retomar).
   - Tamanho da fonte ajustável (P, M, G, GG).
   - Opção de desativar avatares para economizar ainda mais recursos.
   - Alerta sonoro suave em Super Chats.
   - Botão de **Tela Cheia** para não atrapalhar no celular.
   - Tema escuro OLED (economiza bateria e não cansa os olhos no escuro).

---

## 🚀 Como Iniciar

### 1. Iniciar o Servidor no Mac/PC
No terminal dentro da pasta do projeto, execute:
```bash
npm start
```

### 2. Abrir no Celular
O terminal exibirá um **QR Code** e o endereço IP da sua rede local (exemplo: `http://192.168.18.31:3000`).

- Certifique-se de que o celular está conectado na **mesma rede Wi-Fi** do computador.
- Basta abrir a **câmera do celular** e apontar para o QR Code no terminal, ou digitar o endereço no Chrome/Safari do celular!

### 3. Configurar seu Canal
1. Clique no ícone de engrenagem ⚙️ no canto superior direito da tela do celular.
2. Digite seu `@handle` (ex: `@SeuCanal`) ou o link do canal/live e clique em **Salvar**.
3. Pronto! Ficará salvo e você não precisará digitar novamente.

---

## 🛠️ Tecnologias
- **Node.js** + **Express**
- **Socket.io** (comunicação em tempo real em milissegundos)
- **youtube-chat** (captura do chat sem necessidade de API Key paga do Google)
- **qrcode-terminal** (gerador de QR Code no terminal para conexão instantânea)
