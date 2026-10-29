# Pokédex Game

Pokédex interativa em 3D, com batalhas, predição de vitória por machine learning e um Tamagotchi. Projeto de fã, sem fins lucrativos, feito para portfólio e aprendizado.

> **Status:** em desenvolvimento inicial. Hoje existe apenas a **coleta de dados** (script + dataset + imagens). Tudo o que aparece como _(planejado)_ abaixo ainda não foi implementado.

## Sumário

- [Features](#features)
- [Screenshots](#screenshots)
- [Arquitetura](#arquitetura)
- [Stack](#stack)
- [Estrutura de pastas](#estrutura-de-pastas)
- [Como rodar](#como-rodar)
- [Como treinar o modelo](#como-treinar-o-modelo)
- [Estruturas de dados e algoritmos](#estruturas-de-dados-e-algoritmos)
- [Roadmap](#roadmap)
- [Controles](#controles)
- [Aviso legal](#aviso-legal)
- [Créditos](#créditos)

## Features

| Feature | Descrição | Status |
| --- | --- | --- |
| Coleta de dados | Script que baixa dados e imagens dos 1025 Pokémon (gerações 1 a 9) da PokéAPI | ✅ Pronto |
| Carcaça 3D | Dispositivo original vermelho e branco que abre como livro. Gira, abre, fecha e dá zoom na tela. A interface roda dentro da tela 4:3, em estilo handheld 16-bit | 🕒 Planejado |
| Pokédex | Lista por geração ou completa, busca por nome ou número, detalhes com sprite animado, som (cry), tipos, stats base e fun facts. A geração 10 aparece como "em breve" (anunciada para 2027, só os iniciais revelados) | 🕒 Planejado |
| Batalhas | 1x1 entre quaisquer Pokémon e 6x6 por times, com o motor `@pkmn/sim` rodando em API routes do Next.js | 🕒 Planejado |
| Predição de vitória | Probabilidade de vitória antes e durante a batalha, calculada por um modelo treinado e servido via FastAPI | 🕒 Planejado |
| Tamagotchi | Adote um Pokémon e cuide de fome, felicidade, energia e XP, que decaem com o tempo. Ações: alimentar, brincar, dormir e treinar | 🕒 Planejado |

## Screenshots

_Placeholders. Serão adicionados conforme as telas forem ficando prontas._

| Carcaça 3D | Lista da Pokédex | Detalhes |
| --- | --- | --- |
| ![Carcaça 3D](docs/screenshots/shell.png) | ![Lista](docs/screenshots/list.png) | ![Detalhes](docs/screenshots/detail.png) |

| Batalha | Predição de vitória | Tamagotchi |
| --- | --- | --- |
| ![Batalha](docs/screenshots/battle.png) | ![Predição](docs/screenshots/prediction.png) | ![Tamagotchi](docs/screenshots/tamagotchi.png) |

## Arquitetura

_(planejada)_

```mermaid
flowchart LR
    U[Navegador] -->|HTTP| W[web<br/>Next.js + R3F]
    W -->|API routes| S[@pkmn/sim<br/>motor de batalha]
    W -->|REST| M[ml<br/>FastAPI + modelo]
    W -->|SQL| D[(db<br/>Postgres)]
    M -.->|dataset de batalhas simuladas| S
    P[PokéAPI] -->|scrape_pokemon.py| J[data/pokemon.json<br/>sprites/ artwork/]
    J --> W
    J --> M
```

Serviços do Docker Compose: **web**, **ml** e **db**. No início, o estado do Tamagotchi fica em `localStorage`, e o Postgres entra depois para persistência e histórico.

## Stack

| Camada | Tecnologias |
| --- | --- |
| Front | Next.js (App Router), TypeScript, React Three Fiber, drei, zustand |
| Batalha | `@pkmn/sim` (engine do Pokémon Showdown) |
| ML / backend | Python, FastAPI, scikit-learn (ou similar) |
| Banco | Postgres (Tamagotchi e histórico), `localStorage` no início |
| Infra | Docker e Docker Compose |
| Coleta de dados (já existente) | Python 3, somente biblioteca padrão |

## Estrutura de pastas

Pastas marcadas com _(planejado)_ ainda não existem.

```
pokedex-game/
├── scrape_pokemon.py     # coleta dados e imagens da PokéAPI
├── data/
│   └── pokemon.json      # 1025 Pokémon (cache bruto em data/cache/, ignorado pelo git)
├── sprites/              # <id>.png, sprite pequeno
├── artwork/              # <id>.png, artwork oficial em alta resolução
├── web/                  # (planejado) Next.js + R3F + API routes de batalha
├── ml/                   # (planejado) dataset, treino e FastAPI
├── docker-compose.yml    # (planejado) web, ml, db
├── .env.example          # (planejado)
└── README.md
```

## Como rodar

### Coleta de dados (disponível hoje)

Requer apenas Python 3, sem instalar dependências.

```bash
python3 scrape_pokemon.py              # todos os 1025 Pokémon
python3 scrape_pokemon.py --limit 151  # só a primeira geração
python3 scrape_pokemon.py --no-images  # só o JSON, sem imagens
python3 scrape_pokemon.py --workers 4  # menos requisições em paralelo
```

O script é retomável: respostas da API ficam em cache em `data/cache/` e imagens já baixadas são puladas. Formas alternativas (mega, regionais etc.) não são incluídas, apenas as formas padrão.

Campos de cada Pokémon em `data/pokemon.json`:

`id`, `name`, `display_name`, `genus`, `description`, `types`, `height_m`, `weight_kg`, `base_experience`, `stats`, `abilities`, `color`, `habitat`, `generation`, `is_legendary`, `is_mythical`, `capture_rate`, `evolves_from`, `evolution_chain_id`, `sprite`, `artwork`, `sprite_url`, `artwork_url`.

> Cries (sons), sprites animados e fun facts ainda **não** são coletados; entram junto com a Pokédex.

### Aplicação completa _(planejado)_

```bash
cp .env.example .env
docker compose up
```

Variáveis de ambiente previstas no `.env.example` (nomes sujeitos a mudança):

| Variável | Para quê |
| --- | --- |
| `DATABASE_URL` | Conexão com o Postgres |
| `ML_API_URL` | URL do serviço FastAPI usada pelo `web` |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Credenciais do serviço `db` |

## Como treinar o modelo

_(planejado)_ O pipeline previsto:

1. **Dataset:** simular milhares de batalhas com `@pkmn/sim` entre pares de Pokémon e registrar o vencedor.
2. **Features:** stats de cada lado, vantagem de tipo, velocidade relativa e soma de stats.
3. **Treino:** regressão logística como baseline e gradient boosting para comparar.
4. **Serviço:** servir o modelo treinado via FastAPI, devolvendo a probabilidade de vitória.
5. **Comparação:** confrontar o modelo com uma estimativa por **Monte Carlo** (simular a mesma batalha N vezes e contar as vitórias) para medir erro e custo de cada abordagem.

Comandos exatos serão documentados aqui quando o `ml/` existir.

## Estruturas de dados e algoritmos

### Busca por prefixo com busca binária _(planejado)_

Os Pokémon ficam em uma **lista ordenada por nome**. Para a busca por prefixo (o usuário digita "pik" e vê Pikachu, Pikipek...), usamos busca binária para achar a **primeira posição** cujo nome é `>= prefixo` (um _lower bound_) e depois varremos para frente enquanto os nomes começarem com o prefixo.

**Por quê:**

- Os dados são estáticos (1025 itens), então ordenar uma vez compensa.
- Filtrar a lista inteira a cada tecla custa `O(n)`; aqui o custo é menor e previsível.
- Não precisa de estrutura extra como uma trie, que gastaria mais memória para um ganho pequeno nesse tamanho.

**Complexidade:**

| Operação | Custo |
| --- | --- |
| Ordenar (uma vez) | `O(n log n)` |
| Achar o início do intervalo | `O(log n)` |
| Coletar os `k` resultados | `O(k)` |
| Busca completa | `O(log n + k)` |

Busca por número (id) é acesso direto por índice, `O(1)`.

## Roadmap

- [x] Script de coleta de dados e imagens (PokéAPI, 1025 Pokémon)
- [ ] **Fase 1:** Pokédex 2D (dados, lista, busca, detalhes) + Docker
- [ ] **Fase 2:** Carcaça 3D envolvendo a interface
- [ ] **Fase 3:** Batalha 1x1
- [ ] **Fase 4:** Dataset, modelo e barra de probabilidade
- [ ] **Fase 5:** Batalha 6x6
- [ ] **Fase 6:** Tamagotchi

## Controles

_(planejado)_ Teclado e botões físicos da carcaça fazem a mesma coisa.

| Teclado | Botão da carcaça | Ação |
| --- | --- | --- |
| ↑ ↓ ← → | Direcional | Navegar |
| `Z` ou `Enter` | A | Confirmar |
| `X` ou `Backspace` | B | Voltar |
| `Esc` | MENU | Abrir o menu |
| `+` / `-` | ZOOM | Aproximar ou afastar a tela |

O mapeamento exato pode mudar durante a implementação.

## Aviso legal

Pokémon e todos os nomes, imagens e sons relacionados são marcas e propriedade da Nintendo, Game Freak e The Pokémon Company. Este é um projeto de fã, sem fins lucrativos e sem afiliação com essas empresas. O design da carcaça é original.

## Créditos

- [PokéAPI](https://pokeapi.co/): dados, sprites e artworks dos Pokémon.
- [`@pkmn/sim`](https://github.com/pkmn/ps): motor de batalha baseado no Pokémon Showdown.
