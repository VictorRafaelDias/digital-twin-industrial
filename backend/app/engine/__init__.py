"""Motor de simulação do Digital Twin Industrial.

Funções puras (sem banco, sem rede): recebem as máquinas, as conexões e o contexto (temperatura, emergência, play) e
devolvem os números. É o porte fiel de `app/src/engine` do front-end (TypeScript); os testes comparam os dois lados
com casos de referência gerados pelo próprio código do front-end (tests/golden).
"""
