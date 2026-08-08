FROM nginx:alpine

# Copia os arquivos estáticos da landing page para o diretório padrão do Nginx
COPY . /usr/share/nginx/html

# Expõe a porta 80 para o EasyPanel
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
