import NextAuth from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"

const handler = NextAuth({
  providers: [
    CredentialsProvider({
      name: 'Sistema de Acesso',
      credentials: {
        username: { label: "CRM / Usuário", type: "text", placeholder: "medico_sus" },
        password: { label: "Senha", type: "password" }
      },
      async authorize(credentials, req) {
        // MOCK DE LOGIN PARA O MVP DO TCC
        // Em produção, isso bateria no banco de dados para validar o profissional.
        if (credentials?.username && credentials?.password) {
          return { id: "1", name: "Dr(a). Plantonista", email: "medico@ubs.gov.br" }
        }
        return null
      }
    })
  ],
  secret: process.env.NEXTAUTH_SECRET,
})

export { handler as GET, handler as POST }
