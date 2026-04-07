# Guia de Contribuição

## Fluxo de Trabalho (GitFlow)
Branches principais:
- `main`:    Contém o código de produção.
             Não faça push direto para cá.
- `develop`: Contém o código da versão em desenvolvimento.
             Faça Pull Request para esta branch.

1. Preparando o ambiente
```bash
# Clone o repositorio
git clone <repo-url>
cd <nome-do-repo>

# Mude para a branch de deesenvolvimento
git checkout develop

# Puxe as últimas atualziacoes
git pull origin develop
```

2. Criando sua branch
Utilize as praticas ["Conventional Commits"](https://www.conventionalcommits.org/en/v1.0.0/)
- `feat`:     Uma nova funcionalidade.  - (Ex.: `feat/login-oauth`)
- `fix`:      Uma correção de bug.      - (Ex.: `fix/calculo-juros-inc`)
- `chore`:    Manutenção, scripts, etc. - (Ex.: `chore/att-dockerfile`)
- `docs`:     Mudanças na documentação. - (Ex.: `docs/att-reademe`)

```bash
git checkout -b "<nome-da-branch>"
```

3. Commit
```bash
# Exemplo de commit
git commit -m "feat: adiciona autenticação via google"

# Exemplo de correção
git commit -m "fix: corrige estouro de memoria no processamento do csv"
```

4. Enviando Pull Request (PR)
Quando a funcionalidade estiver pronta e funcionando.
    1. Sincronize sua branch com as mudanças da develop ee resolve os conflitos localmente.
    ```bash
    git checkout develop
    git pull origin develop
    git checkout <nome-da-branch-criada>
    git merge develop
    # resolve os conflitos
    ```

    2. Envie sua branch
    ```bash
    git push origin "<nome-da-branch-criada>"
    ```

    3. Abra o PR
    - Vá para o repositório no GitHub
    - Clique em "New Pull Request"
    - Base: `develop`
    - Compare: `<nome-da-branch-criada>`

## Testando
1. Testes
- Para novas funcionalidades (branches: feat), escreva os testes e adicione-os na pasta /tests.
- Para correção de bugs (branches: fix), corriga os teestes que falharam

2. Rode os testes:
Antes de abrir um PR, rode todos os testes localmente para garantir o funcionaamento.
```bash
pytest
```