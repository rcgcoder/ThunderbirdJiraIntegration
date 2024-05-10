## Thunderbird Extension - Nodejs app: Crear Issues de Jira a partir de los correos almacenados en Thunderbird

El sistema se basa en dos componentes:

* La extensión de thunderbird que revisa los correos en las carpetas identificadas y en función de si en From/To/CC aparece algunas direcciones realiza una petición POST a un servicio nodejs para que utilizando la API de jira cree el Issue Correspondiente
* El Servicio nodejs que recibe el mensaje como un string en formato RFC822 y utilizando la api de jira y el token de autenticación pasado por la extensión thunderbird se encarga de extraer los adjuntos, el asunto, la información de los campos DE/PARA/CC y la información de enlace de issues.
	
# Seguridad #

El sistema inicialmente esta diseñado para una sola operación y ejecución en local por lo que las medidas de seguridad implementadas son las minimas. No hay gestión de usuarios y todos los parámetros de configuración se pasan desde el interfaz de la extensión thunderbird a la aplicacion nodejs. 

La aplicacion nodejs puede utilizarse en http (configuración actual) o utiliza https si se incluyen las partes necesarias de los certificados en el servidor nodejs y se comprueba que la extensión puede validar los certificados en caso de utilizarse autogenerados. 
Los parametros de configuración se introducen en la Extensión Thunderbird:

- Token JIRA: Combinación (usuario + token)  de acceso en base64 (https://developer.atlassian.com/cloud/jira/platform/basic-auth-for-rest-apis/) el servicio nodejs simplemente introducira un header "Authorization" con el valor "Basic PARAMETRO_CONFIGURACION"
- Servidor JIRA: la url base del servidor jira https://......atlassian.net/
- Servidor NODEJS: la url base del servidor nodejs. Les peticiones al servicio se realizan por POST concatenando el nombre de la accion.	
- Distinctive Mail Dirs: Lista de direcciones de correo que se remitiran a jira (separadas por ",") si aparecen en (FROM/TO/CC)
- Group X Mails: lista de direcciones de correo utilizadas para detectar de forma automática algunos valores de los customfields
- Account: Identificador de la cuenta sobre la que se procesaran los paths (thunderbird soporta multiples cuentas de correo simultáneas)
- Paths: Lista de carpetas que se analizaran para buscar correos en los que aparezca al menos una dirección de la lista de direcciones

Estos parámetros se pasan a nodejs en la petición post "/config". 

*[Riesgo de seguridad] La aplicacion no gestiona usuarios, autorizaciones/permisos, ni mantiene varias configuraciones simultáneas por lo que si cualquier cliente realiza una peticion post a "/config" modificará instantáneamente el funcionamiento del envío de los correos*

Algunos parámetros se han incluido "directamente" en el código por ser específicos del proceso o del tipo de issue a crear en el proyecto concreto de jira para el que se hizo el desarrollo. Se encuentran en el archivo apiJira.js la generación del json para la creación del issue:

- Identificador del Proyecto
- Identificador del tipo de Issue
- Identificadores de los customfields
- Identificadores para los valores de los customfields que son listas desplegables
	
Para evitar dejar demasiados correos en GitHub se han añadido tres parametros de configuración

- Group 1 mails: en el caso del desarrollo todos los correos recibidos o enviados a esta lista estarán asociados a la C15
- Group 2 mails: en el caso del desarrollo todos los correos recibidos o enviados a esta lista estarán asociados a la C11
- Group 3 mails: en el caso del desarrollo todos los correos recibidos o enviados a esta lista estarán asociados al CAU
- Group Source mails: lista utilizada para identificar si el correo ha sido enviado por el equipo (si alguno de ellos coincide con FROM) en otro caso el correo se considera "Recibido" por el equipo.
	
*[Riesgo de seguridad] para evitar tener que escribir constantemente los parametros de configuración la extensión de thunderbird los graba en el localstorage "localStorage.setItem("ExportJiraConfig",JSON.stringify(params));" por lo que alguna otra extensión quizá podría llegar a leerlos.*

	
# Extensión Thunderbird #

La prueba inicial enviaba directamente a Jira las issues mediante el sistema de recepción SMTP del propio JIRA y utilizaba una automatización para intentar extraer los campos. El problema era que el sistema de automatización es muy simple y no es capaz de procesar información adicional al propio mail (como un adjunto en json/xml o un texto añadido al final del cuerpo del mensaje) tampoco permite anidar IF's,etc. Es probable que en el codigo queden trazas de esta primera estrategia.

Una vez trasladada a nodejs la tarea de registrar los mails en Jira la extensión reduce su funcionalidad al mínimo:

1. Enviar la configuración, 
2. Revisar todos los correos de la cuenta y paths indicados
	- Filtrar cada correo contra la lista 
	- Enviarlos a nodejs.
3. Indicarle a nodejs que remita la lista completa a Jira.

No se hace control de errores ni mensajes de progreso porque, por definición, la aplicación esta orientada a ejecutarse en local.

Se hace una carga completa de los mails antes de enviarlo a jira principalmente para añadirlos en orden creciente de fecha de recepción/envío y además procesa las relaciones entre los correos enviados. Las pruebas con más de 500 correos con multiples adjuntos no han generado problemas de memoria ni en tiempo de ejecución mientras que crear una base de datos complicaría la instalación y ejecución en local.

# Servicio NodeJS #

El servicio nodejs inicialmente era llamado (endpoint "/processissue" por la automatización jira para analizar el mail y devolver todos los parametros de forma que la automatización fuera la que cumplimentaba los customfields. Dadas las limitaciones del sistema de automatización y la simplicidad de las peticiones REST a la api de jira finalmente crea los issues y realiza todas las operaciones

El servicio tiene tres endpoints:

- /config: recibe los parametros de configuración y los almacena en memoria
- /sendtojira: recibe un texto en formato RCF822, lo analiza para extraer todos los campos del correo y los adjuntos (en caso de correos adjuntos realiza el análisis recursivamente) y lo almacena en memoria
- /processallissues: reordena todos los correos por fecha (de menor a mayor) identifica las relaciones entre los correos y crea las issues, añade los adjuntos y las relaciones "Relacionado con"
	
El servicio extrae todos los adjuntos del correo y los adjunta directamente en el issue. Además extrae también los ficheros de los correos que hubieran sido adjuntados al primero para que el apartado attachments tenga accesibles todos los archivos del mensaje.

Los ficheros binarios (pdf, imagenes, etc) pueden verse directamente en el visor jira pero los archivos de mensajes (.eml) se muestran en texto plano en el visor pero si se descargan y abren en un cliente de correo como thunderbird se visualiza correctamente. 

Con el prefijo "ORIGINAL" se incluye como attachment del issue el correo que dio origen al issue por si acaso es necesario consultar las cabeceras o metadatos del mail recibido/enviado (por ejemplo el CCO que no se registra en jira como campo)e

Para crear el issue (apiJira.js) es necesario crear un JSON con todos las propiedades del tipo de issue que se va a crear para lo que necesita conocer los identificadores de los customfields y los values de los customfields de tipo lista así como las reglas de negocio asociadas para la cumplimentación de los campos más específicos.

Los campos generales que se cumplimentan en este programa son:

- project:
- issuetype
- TO: lista de correos separadas por ";" (puede superar los 255 caracteres por lo que tiene que tener tipo "texto largo"
- CC: lista de correos separadas por ";" (puede superar los 255 caracteres por lo que tiene que tener tipo "texto largo"
- FROM: correo del emisor
- summary: las 250 primeras letras del asunto del corre
- description: el texto (plano) del correo y, si no existe, el campo html (jira procesa mal los html por lo que es mejor utilizar el campo de texto plano
- fecha y hora del mensaje: en formato jira. podria utilizarse el campo "fecha de creación" pero utilizar un campo específico permite más posibilidades
- recibido/enviado: Si el "FROM" esta incluido en la lista de direcciones "source mails" se seleccionará la opcion "Enviado" y si no la opcion "Recibido"

*Los enlaces entre Issues se utilizan con el tipo "Related" independientemente de que su origen sea "In-Reply-To" o "Related" para evitar crear un tipo de relación adicional.*

Campos específicos utilizados en el programa:

- Message-ID, References, In-Reply-To, X-forwarded-Message-ID: para almacenar internamente estos campos ya sea para posteriores tratamientos, consultas, etc.
- Otros campos asociados al proyecto concreto en el que se ha utilizado la aplicacion

  
## TODO ## 

Lineas de trabajo interesantes a partir del estado actual

- Convertir la parte de nodejs en una aplicacion systemjs para cargarla directamente en la extension del thunderbird evitando así tener que lanzar nodejs y los riesgos de seguridad asociados a las comunicaciones entre la extensión y el servicio
- Mejorar el interfaz web de la extensión 
- Administrar los codigos de los customfields
- Mejorar las reglas de negocio para abstraerlas de conocer los nombres/id de los customfields (consultando por ejemplo la informacion a la api de jira)
- Modificar la funcionalidad para no tener que esperar a cargar todos los mensajes antes de iniciar el envío (consumo de memoria vs tiempo de ejecucion y peticiones)
- Analizar la posibilidad de que el servicio sea externo como un plugin de jira
- Añadir la funcionalidad de descargar los mensajes de un servidor IMAP
     	




 



