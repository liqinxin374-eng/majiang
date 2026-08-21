import os

nginx_conf_path = '/etc/nginx/nginx.conf'
with open(nginx_conf_path, 'r', encoding='utf-8') as f:
    text = f.read()

idx = text.find('#mail {')
if idx != -1:
    clean_text = text[:idx].strip() + '\n'
    with open('/tmp/nginx.conf', 'w', encoding='utf-8') as f:
        f.write(clean_text)
    os.system('sudo mv /tmp/nginx.conf /etc/nginx/nginx.conf')

default_path = '/etc/nginx/sites-enabled/default'
if os.path.exists(default_path):
    with open(default_path, 'r', encoding='utf-8') as f:
        d_text = f.read()
    idx2 = d_text.find('# Virtual Host configuration')
    if idx2 != -1:
        clean_d = d_text[:idx2].strip() + '\n'
        with open('/tmp/default', 'w', encoding='utf-8') as f:
            f.write(clean_d)
        os.system('sudo mv /tmp/default /etc/nginx/sites-enabled/default')

print("Applied clean nginx configs. Testing...")
os.system('sudo nginx -t && sudo systemctl reload nginx')
