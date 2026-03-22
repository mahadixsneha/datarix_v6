const { getDb, runRaw } = require('../lib/db');
const { requireAuth, cors } = require('../lib/auth');
const { safeName, userTableName, safeType } = require('../lib/sanitize');
const { checkLimit } = require('../lib/plan');

const TEMPLATES = {
  earning_app: {
    name: 'Earning App', icon: 'payments', color: '#3ecf8e',
    description: 'Tasks, withdrawals, referrals, leaderboard — full earning platform',
    tables: [
      { name: 'ea_settings', type: 'sql', columns: [
        {name:'key',type:'TEXT'},{name:'value',type:'TEXT'},{name:'updated_at',type:'TIMESTAMP'}
      ], sample: [
        {key:'minWithdraw',value:'10'},{key:'referralBonus',value:'1'},
        {key:'referralRequirement',value:'3'},{key:'dailyBonus',value:'0.5'},
        {key:'adReward',value:'0.2'},{key:'maxAdsPerDay',value:'10'},
        {key:'paymentMethods',value:'bKash,Nagad,Rocket'},
        {key:'announcementText',value:''},{key:'announcementActive',value:'false'},
        {key:'maintenanceMode',value:'false'}
      ]},
      { name: 'ea_users', type: 'sql', columns: [
        {name:'uid',type:'TEXT'},{name:'name',type:'TEXT'},{name:'email',type:'TEXT'},
        {name:'avatar',type:'TEXT'},{name:'gender',type:'TEXT'},
        {name:'balance',type:'NUMERIC'},{name:'lifetime_earnings',type:'NUMERIC'},
        {name:'total_friends',type:'INTEGER'},{name:'referred_by',type:'TEXT'},
        {name:'ads_watched_today',type:'INTEGER'},{name:'last_ad_watched_at',type:'TIMESTAMP'},
        {name:'last_login_bonus_at',type:'TIMESTAMP'},{name:'status',type:'TEXT'},
        {name:'created_at',type:'TIMESTAMP'},{name:'last_login',type:'TIMESTAMP'}
      ]},
      { name: 'ea_tasks', type: 'sql', columns: [
        {name:'title',type:'TEXT'},{name:'description',type:'TEXT'},
        {name:'reward',type:'NUMERIC'},{name:'url',type:'TEXT'},
        {name:'type',type:'TEXT'},{name:'is_active',type:'BOOLEAN'},
        {name:'sort_order',type:'INTEGER'},{name:'created_at',type:'TIMESTAMP'}
      ], sample: [
        {title:'Watch Video',description:'Watch this video and earn',reward:5,url:'https://youtube.com',type:'video',is_active:true,sort_order:1,created_at:new Date().toISOString()},
        {title:'Visit Website',description:'Visit our partner site',reward:2,url:'https://example.com',type:'visit',is_active:true,sort_order:2,created_at:new Date().toISOString()}
      ]},
      { name: 'ea_transactions', type: 'sql', columns: [
        {name:'user_id',type:'TEXT'},{name:'user_name',type:'TEXT'},
        {name:'amount',type:'NUMERIC'},{name:'type',type:'TEXT'},
        {name:'description',type:'TEXT'},{name:'status',type:'TEXT'},
        {name:'created_at',type:'TIMESTAMP'}
      ]},
      { name: 'ea_withdrawals', type: 'sql', columns: [
        {name:'user_id',type:'TEXT'},{name:'user_name',type:'TEXT'},
        {name:'method',type:'TEXT'},{name:'account_number',type:'TEXT'},
        {name:'amount',type:'NUMERIC'},{name:'status',type:'TEXT'},
        {name:'note',type:'TEXT'},{name:'reviewed_at',type:'TIMESTAMP'},
        {name:'created_at',type:'TIMESTAMP'}
      ]},
      { name: 'ea_announcements', type: 'sql', columns: [
        {name:'title',type:'TEXT'},{name:'text',type:'TEXT'},
        {name:'type',type:'TEXT'},{name:'is_active',type:'BOOLEAN'},
        {name:'created_at',type:'TIMESTAMP'}
      ]}
    ]
  },
  blog_cms: {
    name: 'Blog / CMS', icon: 'article', color: '#6366f1',
    description: 'Posts, categories, comments, tags, subscribers',
    tables: [
      { name: 'blog_categories', type: 'sql', columns: [
        {name:'name',type:'TEXT'},{name:'slug',type:'TEXT'},{name:'description',type:'TEXT'},
        {name:'image',type:'TEXT'},{name:'sort_order',type:'INTEGER'},{name:'is_active',type:'BOOLEAN'}
      ], sample: [
        {name:'Technology',slug:'technology',description:'Tech articles',image:'',sort_order:1,is_active:true},
        {name:'News',slug:'news',description:'Latest news',image:'',sort_order:2,is_active:true},
        {name:'Tutorial',slug:'tutorial',description:'How-to guides',image:'',sort_order:3,is_active:true}
      ]},
      { name: 'blog_posts', type: 'sql', columns: [
        {name:'title',type:'TEXT'},{name:'slug',type:'TEXT'},{name:'content',type:'TEXT'},
        {name:'excerpt',type:'TEXT'},{name:'thumbnail',type:'TEXT'},
        {name:'category_id',type:'INTEGER'},{name:'author',type:'TEXT'},
        {name:'tags',type:'TEXT'},{name:'status',type:'TEXT'},
        {name:'views',type:'INTEGER'},{name:'likes',type:'INTEGER'},
        {name:'featured',type:'BOOLEAN'},{name:'meta_title',type:'TEXT'},
        {name:'meta_description',type:'TEXT'},{name:'created_at',type:'TIMESTAMP'},
        {name:'updated_at',type:'TIMESTAMP'}
      ], sample: [
        {title:'Welcome to the Blog',slug:'welcome',content:'First post content.',excerpt:'First post.',thumbnail:'',category_id:1,author:'Admin',tags:'welcome',status:'published',views:0,likes:0,featured:true,meta_title:'Welcome',meta_description:'Welcome post',created_at:new Date().toISOString(),updated_at:new Date().toISOString()}
      ]},
      { name: 'blog_comments', type: 'sql', columns: [
        {name:'post_id',type:'INTEGER'},{name:'parent_id',type:'INTEGER'},
        {name:'author_name',type:'TEXT'},{name:'author_email',type:'TEXT'},
        {name:'content',type:'TEXT'},{name:'status',type:'TEXT'},
        {name:'likes',type:'INTEGER'},{name:'created_at',type:'TIMESTAMP'}
      ]},
      { name: 'blog_tags', type: 'sql', columns: [
        {name:'name',type:'TEXT'},{name:'slug',type:'TEXT'},{name:'post_count',type:'INTEGER'}
      ], sample: [
        {name:'Technology',slug:'technology',post_count:0},
        {name:'News',slug:'news',post_count:0}
      ]},
      { name: 'blog_subscribers', type: 'sql', columns: [
        {name:'email',type:'TEXT'},{name:'name',type:'TEXT'},
        {name:'is_active',type:'BOOLEAN'},{name:'source',type:'TEXT'},
        {name:'created_at',type:'TIMESTAMP'}
      ]},
      { name: 'blog_settings', type: 'sql', columns: [
        {name:'key',type:'TEXT'},{name:'value',type:'TEXT'}
      ], sample: [
        {key:'site_name',value:'My Blog'},{key:'posts_per_page',value:'10'},
        {key:'allow_comments',value:'true'},{key:'footer_text',value:'© 2025 My Blog'}
      ]}
    ]
  },
  ecommerce: {
    name: 'E-commerce', icon: 'shopping_cart', color: '#f4a261',
    description: 'Products, orders, customers, coupons, reviews',
    tables: [
      { name: 'shop_categories', type: 'sql', columns: [
        {name:'name',type:'TEXT'},{name:'slug',type:'TEXT'},{name:'description',type:'TEXT'},
        {name:'image',type:'TEXT'},{name:'parent_id',type:'INTEGER'},
        {name:'sort_order',type:'INTEGER'},{name:'is_active',type:'BOOLEAN'}
      ], sample: [
        {name:'Electronics',slug:'electronics',description:'Electronic items',image:'',parent_id:null,sort_order:1,is_active:true},
        {name:'Clothing',slug:'clothing',description:'Fashion items',image:'',parent_id:null,sort_order:2,is_active:true}
      ]},
      { name: 'shop_products', type: 'sql', columns: [
        {name:'name',type:'TEXT'},{name:'slug',type:'TEXT'},{name:'description',type:'TEXT'},
        {name:'price',type:'NUMERIC'},{name:'sale_price',type:'NUMERIC'},{name:'cost_price',type:'NUMERIC'},
        {name:'stock',type:'INTEGER'},{name:'low_stock_alert',type:'INTEGER'},
        {name:'category_id',type:'INTEGER'},{name:'images',type:'TEXT'},{name:'thumbnail',type:'TEXT'},
        {name:'sku',type:'TEXT'},{name:'weight',type:'NUMERIC'},{name:'tags',type:'TEXT'},
        {name:'is_active',type:'BOOLEAN'},{name:'is_featured',type:'BOOLEAN'},
        {name:'views',type:'INTEGER'},{name:'total_sold',type:'INTEGER'},
        {name:'rating',type:'NUMERIC'},{name:'review_count',type:'INTEGER'},
        {name:'created_at',type:'TIMESTAMP'},{name:'updated_at',type:'TIMESTAMP'}
      ], sample: [
        {name:'Sample Product',slug:'sample-product',description:'A great product.',price:99.99,sale_price:79.99,cost_price:50,stock:100,low_stock_alert:10,category_id:1,images:'',thumbnail:'',sku:'SKU001',weight:0.5,tags:'sample',is_active:true,is_featured:true,views:0,total_sold:0,rating:0,review_count:0,created_at:new Date().toISOString(),updated_at:new Date().toISOString()}
      ]},
      { name: 'shop_customers', type: 'sql', columns: [
        {name:'name',type:'TEXT'},{name:'email',type:'TEXT'},{name:'phone',type:'TEXT'},
        {name:'address',type:'TEXT'},{name:'city',type:'TEXT'},{name:'country',type:'TEXT'},
        {name:'total_orders',type:'INTEGER'},{name:'total_spent',type:'NUMERIC'},
        {name:'status',type:'TEXT'},{name:'created_at',type:'TIMESTAMP'}
      ]},
      { name: 'shop_orders', type: 'sql', columns: [
        {name:'order_number',type:'TEXT'},{name:'customer_id',type:'INTEGER'},
        {name:'customer_name',type:'TEXT'},{name:'customer_email',type:'TEXT'},
        {name:'customer_phone',type:'TEXT'},{name:'items',type:'TEXT'},
        {name:'subtotal',type:'NUMERIC'},{name:'discount',type:'NUMERIC'},
        {name:'shipping',type:'NUMERIC'},{name:'tax',type:'NUMERIC'},{name:'total',type:'NUMERIC'},
        {name:'status',type:'TEXT'},{name:'payment_method',type:'TEXT'},
        {name:'payment_status',type:'TEXT'},{name:'transaction_id',type:'TEXT'},
        {name:'shipping_address',type:'TEXT'},{name:'note',type:'TEXT'},
        {name:'coupon_code',type:'TEXT'},{name:'created_at',type:'TIMESTAMP'},{name:'updated_at',type:'TIMESTAMP'}
      ]},
      { name: 'shop_reviews', type: 'sql', columns: [
        {name:'product_id',type:'INTEGER'},{name:'customer_name',type:'TEXT'},
        {name:'rating',type:'INTEGER'},{name:'title',type:'TEXT'},{name:'comment',type:'TEXT'},
        {name:'is_approved',type:'BOOLEAN'},{name:'created_at',type:'TIMESTAMP'}
      ]},
      { name: 'shop_coupons', type: 'sql', columns: [
        {name:'code',type:'TEXT'},{name:'type',type:'TEXT'},{name:'value',type:'NUMERIC'},
        {name:'min_order',type:'NUMERIC'},{name:'usage_limit',type:'INTEGER'},
        {name:'used_count',type:'INTEGER'},{name:'is_active',type:'BOOLEAN'},
        {name:'expires_at',type:'TIMESTAMP'},{name:'created_at',type:'TIMESTAMP'}
      ], sample: [
        {code:'WELCOME10',type:'percent',value:10,min_order:50,usage_limit:100,used_count:0,is_active:true,expires_at:null,created_at:new Date().toISOString()}
      ]},
      { name: 'shop_settings', type: 'sql', columns: [
        {name:'key',type:'TEXT'},{name:'value',type:'TEXT'}
      ], sample: [
        {key:'store_name',value:'My Store'},{key:'currency',value:'BDT'},
        {key:'currency_symbol',value:'৳'},{key:'shipping_fee',value:'60'},
        {key:'free_shipping_above',value:'500'},{key:'order_prefix',value:'ORD-'}
      ]}
    ]
  },
  todo_manager: {
    name: 'Todo / Task Manager', icon: 'checklist', color: '#a78bfa',
    description: 'Projects, tasks, subtasks, labels, time tracking',
    tables: [
      { name: 'todo_projects', type: 'sql', columns: [
        {name:'name',type:'TEXT'},{name:'description',type:'TEXT'},
        {name:'color',type:'TEXT'},{name:'icon',type:'TEXT'},
        {name:'owner',type:'TEXT'},{name:'is_archived',type:'BOOLEAN'},
        {name:'sort_order',type:'INTEGER'},{name:'created_at',type:'TIMESTAMP'}
      ], sample: [
        {name:'Personal',description:'Personal tasks',color:'#6366f1',icon:'person',owner:'me',is_archived:false,sort_order:1,created_at:new Date().toISOString()},
        {name:'Work',description:'Work tasks',color:'#3ecf8e',icon:'work',owner:'me',is_archived:false,sort_order:2,created_at:new Date().toISOString()}
      ]},
      { name: 'todo_tasks', type: 'sql', columns: [
        {name:'title',type:'TEXT'},{name:'description',type:'TEXT'},
        {name:'project_id',type:'INTEGER'},{name:'parent_id',type:'INTEGER'},
        {name:'priority',type:'TEXT'},{name:'status',type:'TEXT'},
        {name:'due_date',type:'DATE'},{name:'label_ids',type:'TEXT'},
        {name:'assigned_to',type:'TEXT'},{name:'estimated_hours',type:'NUMERIC'},
        {name:'actual_hours',type:'NUMERIC'},{name:'sort_order',type:'INTEGER'},
        {name:'created_at',type:'TIMESTAMP'},{name:'completed_at',type:'TIMESTAMP'},
        {name:'updated_at',type:'TIMESTAMP'}
      ], sample: [
        {title:'Your first task!',description:'Click to edit',project_id:1,parent_id:null,priority:'medium',status:'pending',due_date:null,label_ids:'',assigned_to:'',estimated_hours:1,actual_hours:0,sort_order:1,created_at:new Date().toISOString(),completed_at:null,updated_at:new Date().toISOString()}
      ]},
      { name: 'todo_labels', type: 'sql', columns: [
        {name:'name',type:'TEXT'},{name:'color',type:'TEXT'},{name:'description',type:'TEXT'}
      ], sample: [
        {name:'Urgent',color:'#f25f5c',description:'High priority'},
        {name:'Important',color:'#f4a261',description:'Medium priority'},
        {name:'Later',color:'#3ecf8e',description:'Low priority'},
        {name:'Bug',color:'#a78bfa',description:'Bug to fix'}
      ]},
      { name: 'todo_comments', type: 'sql', columns: [
        {name:'task_id',type:'INTEGER'},{name:'author',type:'TEXT'},
        {name:'content',type:'TEXT'},{name:'created_at',type:'TIMESTAMP'}
      ]},
      { name: 'todo_time_logs', type: 'sql', columns: [
        {name:'task_id',type:'INTEGER'},{name:'user',type:'TEXT'},
        {name:'hours',type:'NUMERIC'},{name:'description',type:'TEXT'},
        {name:'logged_at',type:'TIMESTAMP'}
      ]}
    ]
  },
  contact_form: {
    name: 'Contact Form / Leads', icon: 'contact_mail', color: '#f25f5c',
    description: 'Leads, newsletter, feedback, support tickets',
    tables: [
      { name: 'cf_leads', type: 'sql', columns: [
        {name:'name',type:'TEXT'},{name:'email',type:'TEXT'},{name:'phone',type:'TEXT'},
        {name:'company',type:'TEXT'},{name:'subject',type:'TEXT'},{name:'message',type:'TEXT'},
        {name:'source',type:'TEXT'},{name:'status',type:'TEXT'},{name:'priority',type:'TEXT'},
        {name:'assigned_to',type:'TEXT'},{name:'notes',type:'TEXT'},{name:'ip',type:'TEXT'},
        {name:'created_at',type:'TIMESTAMP'},{name:'replied_at',type:'TIMESTAMP'}
      ]},
      { name: 'cf_newsletter', type: 'sql', columns: [
        {name:'email',type:'TEXT'},{name:'name',type:'TEXT'},
        {name:'is_active',type:'BOOLEAN'},{name:'source',type:'TEXT'},
        {name:'tags',type:'TEXT'},{name:'created_at',type:'TIMESTAMP'}
      ]},
      { name: 'cf_feedback', type: 'sql', columns: [
        {name:'user_name',type:'TEXT'},{name:'email',type:'TEXT'},
        {name:'rating',type:'INTEGER'},{name:'category',type:'TEXT'},
        {name:'message',type:'TEXT'},{name:'status',type:'TEXT'},
        {name:'reply',type:'TEXT'},{name:'created_at',type:'TIMESTAMP'}
      ]},
      { name: 'cf_tickets', type: 'sql', columns: [
        {name:'ticket_number',type:'TEXT'},{name:'name',type:'TEXT'},
        {name:'email',type:'TEXT'},{name:'subject',type:'TEXT'},
        {name:'message',type:'TEXT'},{name:'category',type:'TEXT'},
        {name:'priority',type:'TEXT'},{name:'status',type:'TEXT'},
        {name:'assigned_to',type:'TEXT'},{name:'created_at',type:'TIMESTAMP'},
        {name:'resolved_at',type:'TIMESTAMP'}
      ]},
      { name: 'cf_settings', type: 'sql', columns: [
        {name:'key',type:'TEXT'},{name:'value',type:'TEXT'}
      ], sample: [
        {key:'notify_email',value:''},{key:'success_message',value:'Thank you! We will contact you soon.'},
        {key:'spam_protection',value:'true'},{key:'response_time',value:'24 hours'}
      ]}
    ]
  },
  restaurant: {
    name: 'Restaurant Menu', icon: 'restaurant', color: '#fb923c',
    description: 'Menu, orders, reservations, tables, settings',
    tables: [
      { name: 'rest_categories', type: 'sql', columns: [
        {name:'name',type:'TEXT'},{name:'description',type:'TEXT'},{name:'image',type:'TEXT'},
        {name:'icon',type:'TEXT'},{name:'available_from',type:'TEXT'},{name:'available_to',type:'TEXT'},
        {name:'sort_order',type:'INTEGER'},{name:'is_active',type:'BOOLEAN'}
      ], sample: [
        {name:'Starters',description:'Appetizers',image:'',icon:'🥗',available_from:'',available_to:'',sort_order:1,is_active:true},
        {name:'Main Course',description:'Main dishes',image:'',icon:'🍽️',available_from:'',available_to:'',sort_order:2,is_active:true},
        {name:'Desserts',description:'Sweet endings',image:'',icon:'🍰',available_from:'',available_to:'',sort_order:3,is_active:true},
        {name:'Drinks',description:'Beverages',image:'',icon:'🥤',available_from:'',available_to:'',sort_order:4,is_active:true}
      ]},
      { name: 'rest_menu', type: 'sql', columns: [
        {name:'name',type:'TEXT'},{name:'description',type:'TEXT'},{name:'price',type:'NUMERIC'},
        {name:'sale_price',type:'NUMERIC'},{name:'category_id',type:'INTEGER'},{name:'image',type:'TEXT'},
        {name:'ingredients',type:'TEXT'},{name:'allergens',type:'TEXT'},
        {name:'is_veg',type:'BOOLEAN'},{name:'is_vegan',type:'BOOLEAN'},
        {name:'is_spicy',type:'BOOLEAN'},{name:'is_available',type:'BOOLEAN'},
        {name:'is_featured',type:'BOOLEAN'},{name:'calories',type:'INTEGER'},
        {name:'prep_time',type:'INTEGER'},{name:'sort_order',type:'INTEGER'},
        {name:'total_orders',type:'INTEGER'},{name:'rating',type:'NUMERIC'}
      ], sample: [
        {name:'Spring Rolls',description:'Crispy vegetable rolls',price:120,sale_price:null,category_id:1,image:'',ingredients:'Vegetables, Wrapper',allergens:'Gluten',is_veg:true,is_vegan:false,is_spicy:false,is_available:true,is_featured:false,calories:180,prep_time:10,sort_order:1,total_orders:0,rating:0},
        {name:'Chicken Burger',description:'Juicy grilled chicken',price:280,sale_price:250,category_id:2,image:'',ingredients:'Chicken, Lettuce, Bun',allergens:'Gluten,Egg',is_veg:false,is_vegan:false,is_spicy:false,is_available:true,is_featured:true,calories:450,prep_time:15,sort_order:1,total_orders:0,rating:0}
      ]},
      { name: 'rest_tables', type: 'sql', columns: [
        {name:'table_number',type:'TEXT'},{name:'capacity',type:'INTEGER'},
        {name:'location',type:'TEXT'},{name:'status',type:'TEXT'},{name:'is_active',type:'BOOLEAN'}
      ], sample: [
        {table_number:'T1',capacity:2,location:'Indoor',status:'available',is_active:true},
        {table_number:'T2',capacity:4,location:'Indoor',status:'available',is_active:true},
        {table_number:'T3',capacity:6,location:'Outdoor',status:'available',is_active:true}
      ]},
      { name: 'rest_orders', type: 'sql', columns: [
        {name:'order_number',type:'TEXT'},{name:'table_id',type:'INTEGER'},
        {name:'table_number',type:'TEXT'},{name:'customer_name',type:'TEXT'},
        {name:'customer_phone',type:'TEXT'},{name:'items',type:'TEXT'},
        {name:'subtotal',type:'NUMERIC'},{name:'discount',type:'NUMERIC'},
        {name:'tax',type:'NUMERIC'},{name:'total',type:'NUMERIC'},
        {name:'status',type:'TEXT'},{name:'order_type',type:'TEXT'},
        {name:'payment_method',type:'TEXT'},{name:'payment_status',type:'TEXT'},
        {name:'note',type:'TEXT'},{name:'created_at',type:'TIMESTAMP'},
        {name:'completed_at',type:'TIMESTAMP'}
      ]},
      { name: 'rest_reservations', type: 'sql', columns: [
        {name:'customer_name',type:'TEXT'},{name:'customer_phone',type:'TEXT'},
        {name:'customer_email',type:'TEXT'},{name:'date',type:'DATE'},
        {name:'time',type:'TEXT'},{name:'guests',type:'INTEGER'},
        {name:'table_id',type:'INTEGER'},{name:'status',type:'TEXT'},
        {name:'special_requests',type:'TEXT'},{name:'occasion',type:'TEXT'},
        {name:'created_at',type:'TIMESTAMP'}
      ]},
      { name: 'rest_settings', type: 'sql', columns: [
        {name:'key',type:'TEXT'},{name:'value',type:'TEXT'}
      ], sample: [
        {key:'restaurant_name',value:'My Restaurant'},{key:'currency_symbol',value:'৳'},
        {key:'tax_percent',value:'0'},{key:'opening_time',value:'10:00 AM'},
        {key:'closing_time',value:'10:00 PM'},{key:'order_prefix',value:'ORD-'}
      ]}
    ]
  },
  school_management: {
    name: 'School Management', icon: 'school', color: '#22d3ee',
    description: 'Students, teachers, classes, attendance, grades, fees',
    tables: [
      { name: 'sch_classes', type: 'sql', columns: [
        {name:'name',type:'TEXT'},{name:'section',type:'TEXT'},{name:'grade',type:'TEXT'},
        {name:'teacher_id',type:'INTEGER'},{name:'room',type:'TEXT'},
        {name:'capacity',type:'INTEGER'},{name:'academic_year',type:'TEXT'},{name:'is_active',type:'BOOLEAN'}
      ], sample: [
        {name:'Class 1',section:'A',grade:'1',teacher_id:1,room:'101',capacity:40,academic_year:'2025',is_active:true},
        {name:'Class 2',section:'A',grade:'2',teacher_id:2,room:'102',capacity:40,academic_year:'2025',is_active:true}
      ]},
      { name: 'sch_teachers', type: 'sql', columns: [
        {name:'name',type:'TEXT'},{name:'email',type:'TEXT'},{name:'phone',type:'TEXT'},
        {name:'subject',type:'TEXT'},{name:'qualification',type:'TEXT'},
        {name:'experience_years',type:'INTEGER'},{name:'joining_date',type:'DATE'},
        {name:'salary',type:'NUMERIC'},{name:'status',type:'TEXT'},{name:'created_at',type:'TIMESTAMP'}
      ]},
      { name: 'sch_students', type: 'sql', columns: [
        {name:'roll',type:'TEXT'},{name:'name',type:'TEXT'},{name:'class_id',type:'INTEGER'},
        {name:'gender',type:'TEXT'},{name:'date_of_birth',type:'DATE'},{name:'photo',type:'TEXT'},
        {name:'father_name',type:'TEXT'},{name:'mother_name',type:'TEXT'},
        {name:'guardian_phone',type:'TEXT'},{name:'address',type:'TEXT'},
        {name:'blood_group',type:'TEXT'},{name:'admission_date',type:'DATE'},
        {name:'status',type:'TEXT'},{name:'created_at',type:'TIMESTAMP'}
      ]},
      { name: 'sch_attendance', type: 'sql', columns: [
        {name:'student_id',type:'INTEGER'},{name:'class_id',type:'INTEGER'},
        {name:'date',type:'DATE'},{name:'status',type:'TEXT'},{name:'note',type:'TEXT'}
      ]},
      { name: 'sch_grades', type: 'sql', columns: [
        {name:'student_id',type:'INTEGER'},{name:'class_id',type:'INTEGER'},
        {name:'subject',type:'TEXT'},{name:'exam_type',type:'TEXT'},
        {name:'full_marks',type:'NUMERIC'},{name:'obtained_marks',type:'NUMERIC'},
        {name:'grade',type:'TEXT'},{name:'remarks',type:'TEXT'},{name:'exam_date',type:'DATE'}
      ]},
      { name: 'sch_fees', type: 'sql', columns: [
        {name:'student_id',type:'INTEGER'},{name:'fee_type',type:'TEXT'},
        {name:'amount',type:'NUMERIC'},{name:'paid_amount',type:'NUMERIC'},
        {name:'due_date',type:'DATE'},{name:'paid_date',type:'DATE'},
        {name:'status',type:'TEXT'},{name:'method',type:'TEXT'},{name:'transaction_id',type:'TEXT'},
        {name:'created_at',type:'TIMESTAMP'}
      ]}
    ]
  },
  inventory: {
    name: 'Inventory Manager', icon: 'inventory', color: '#84cc16',
    description: 'Products, stock, suppliers, purchases, sales',
    tables: [
      { name: 'inv_categories', type: 'sql', columns: [
        {name:'name',type:'TEXT'},{name:'description',type:'TEXT'},{name:'is_active',type:'BOOLEAN'}
      ], sample: [
        {name:'Electronics',description:'Electronic items',is_active:true},
        {name:'Furniture',description:'Furniture items',is_active:true}
      ]},
      { name: 'inv_suppliers', type: 'sql', columns: [
        {name:'name',type:'TEXT'},{name:'email',type:'TEXT'},{name:'phone',type:'TEXT'},
        {name:'address',type:'TEXT'},{name:'company',type:'TEXT'},
        {name:'payment_terms',type:'TEXT'},{name:'status',type:'TEXT'},{name:'created_at',type:'TIMESTAMP'}
      ]},
      { name: 'inv_products', type: 'sql', columns: [
        {name:'name',type:'TEXT'},{name:'sku',type:'TEXT'},{name:'barcode',type:'TEXT'},
        {name:'category_id',type:'INTEGER'},{name:'supplier_id',type:'INTEGER'},
        {name:'description',type:'TEXT'},{name:'unit',type:'TEXT'},
        {name:'cost_price',type:'NUMERIC'},{name:'selling_price',type:'NUMERIC'},
        {name:'stock',type:'NUMERIC'},{name:'min_stock',type:'NUMERIC'},
        {name:'max_stock',type:'NUMERIC'},{name:'location',type:'TEXT'},
        {name:'image',type:'TEXT'},{name:'is_active',type:'BOOLEAN'},{name:'created_at',type:'TIMESTAMP'}
      ]},
      { name: 'inv_purchases', type: 'sql', columns: [
        {name:'invoice_number',type:'TEXT'},{name:'supplier_id',type:'INTEGER'},
        {name:'items',type:'TEXT'},{name:'subtotal',type:'NUMERIC'},{name:'tax',type:'NUMERIC'},
        {name:'discount',type:'NUMERIC'},{name:'total',type:'NUMERIC'},{name:'paid',type:'NUMERIC'},
        {name:'status',type:'TEXT'},{name:'note',type:'TEXT'},{name:'purchased_at',type:'TIMESTAMP'}
      ]},
      { name: 'inv_sales', type: 'sql', columns: [
        {name:'invoice_number',type:'TEXT'},{name:'customer_name',type:'TEXT'},
        {name:'customer_phone',type:'TEXT'},{name:'items',type:'TEXT'},
        {name:'subtotal',type:'NUMERIC'},{name:'tax',type:'NUMERIC'},{name:'discount',type:'NUMERIC'},
        {name:'total',type:'NUMERIC'},{name:'paid',type:'NUMERIC'},
        {name:'payment_method',type:'TEXT'},{name:'status',type:'TEXT'},
        {name:'note',type:'TEXT'},{name:'sold_at',type:'TIMESTAMP'}
      ]},
      { name: 'inv_stock_logs', type: 'sql', columns: [
        {name:'product_id',type:'INTEGER'},{name:'type',type:'TEXT'},
        {name:'quantity',type:'NUMERIC'},{name:'before',type:'NUMERIC'},{name:'after',type:'NUMERIC'},
        {name:'reference',type:'TEXT'},{name:'note',type:'TEXT'},{name:'created_at',type:'TIMESTAMP'}
      ]}
    ]
  },
  custom_collection: {
    name: 'Custom Collection', icon: 'data_object', color: '#22d3ee',
    description: 'MongoDB-style schema-less JSONB — store any JSON structure',
    tables: [
      { name: 'my_collection', type: 'collection', columns: [] }
    ]
  }
};

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const action = req.query.action || (req.method === 'GET' ? 'list' : 'create');
  const sql = getDb();

  // PUBLIC — list templates
  if (action === 'templates') {
    const list = Object.entries(TEMPLATES).map(([key, t]) => ({
      key, name: t.name, description: t.description, icon: t.icon, color: t.color,
      table_count: t.tables.length,
      tables: t.tables.map(tb => ({ name: tb.name, type: tb.type || 'sql', columns: tb.columns.length }))
    }));
    return res.json({ templates: list });
  }

  const user = requireAuth(req, res); if (!user) return;

  // LIST
  if (action === 'list') {
    try {
      const tables = await sql`SELECT id, table_name, physical_name, table_type, schema, is_public, created_at FROM tb_table_registry WHERE user_id = ${user.id} ORDER BY created_at DESC`;
      const result = [];
      for (const t of tables) {
        let rowCount = 0;
        try { const cnt = await runRaw(`SELECT COUNT(*) as count FROM "${t.physical_name}"`); rowCount = parseInt(cnt[0].count) || 0; } catch (e) {}
        result.push({ ...t, row_count: rowCount });
      }
      return res.json({ tables: result });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  // CREATE
  if (action === 'create') {
    const limit = await checkLimit(user.id, 'tables');
    if (!limit.allowed) return res.status(400).json({ error: limit.message });
    const { table_name, columns, raw_sql, table_type = 'sql' } = req.body || {};
    if (!table_name) return res.status(400).json({ error: 'Table name required' });
    const cleanName = safeName(table_name);
    const physicalName = userTableName(user.id, table_name);
    try {
      const existing = await sql`SELECT id FROM tb_table_registry WHERE user_id = ${user.id} AND table_name = ${cleanName}`;
      if (existing.length) return res.status(409).json({ error: 'Table name already exists' });
      let createSQL, schemaJson;
      if (table_type === 'collection') {
        createSQL = `CREATE TABLE "${physicalName}" (id SERIAL PRIMARY KEY, data JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW())`;
        schemaJson = JSON.stringify({ type: 'collection' });
      } else if (raw_sql) {
        const trimmed = raw_sql.trim();
        if (/^\s*CREATE\s+TABLE/i.test(trimmed)) {
          createSQL = trimmed.replace(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?\S+/i, `CREATE TABLE "${physicalName}"`);
        } else {
          const colDefs = trimmed.replace(/^,+|,+$/g, '').trim();
          createSQL = `CREATE TABLE "${physicalName}" (id SERIAL PRIMARY KEY, ${colDefs})`;
        }
        schemaJson = JSON.stringify({ raw: true, sql: raw_sql });
      } else {
        const colDefs = (columns || []).filter(c => c.name && c.type).map(c => {
          let def = `"${safeName(c.name)}" ${safeType(c.type)}`;
          if (c.not_null) def += ' NOT NULL';
          if (c.unique) def += ' UNIQUE';
          if (c.default !== undefined && c.default !== '') def += ` DEFAULT '${c.default}'`;
          return def;
        }).join(', ');
        createSQL = colDefs ? `CREATE TABLE "${physicalName}" (id SERIAL PRIMARY KEY, ${colDefs})` : `CREATE TABLE "${physicalName}" (id SERIAL PRIMARY KEY)`;
        schemaJson = JSON.stringify({ raw: false, type: 'sql', columns: columns || [] });
      }
      await runRaw(createSQL);
      const rows = await sql`INSERT INTO tb_table_registry (user_id, table_name, physical_name, table_type, schema) VALUES (${user.id}, ${cleanName}, ${physicalName}, ${table_type}, ${schemaJson}) RETURNING *`;
      await sql`INSERT INTO tb_activity (user_id, action, details) VALUES (${user.id}, 'create_table', ${`Created ${table_type}: ${cleanName}`})`;
      return res.status(201).json({ table: rows[0] });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  // APPLY TEMPLATE
  if (action === 'apply_template') {
    const { template_key, with_sample } = req.body || {};
    const tpl = TEMPLATES[template_key];
    if (!tpl) return res.status(404).json({ error: 'Template not found' });
    const results = [];
    for (const tbl of tpl.tables) {
      const limit = await checkLimit(user.id, 'tables');
      if (!limit.allowed) { results.push({ name: tbl.name, error: 'Plan limit reached' }); continue; }
      const cleanName = safeName(tbl.name);
      const physName = userTableName(user.id, tbl.name);
      try {
        const existing = await sql`SELECT id FROM tb_table_registry WHERE user_id = ${user.id} AND table_name = ${cleanName}`;
        if (existing.length) { results.push({ name: tbl.name, status: 'skipped', reason: 'already exists' }); continue; }
        let createSQL;
        if (tbl.type === 'collection') {
          createSQL = `CREATE TABLE "${physName}" (id SERIAL PRIMARY KEY, data JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW())`;
        } else {
          const colDefs = tbl.columns.map(c => `"${safeName(c.name)}" ${safeType(c.type)}`).join(', ');
          createSQL = colDefs ? `CREATE TABLE "${physName}" (id SERIAL PRIMARY KEY, ${colDefs})` : `CREATE TABLE "${physName}" (id SERIAL PRIMARY KEY)`;
        }
        await runRaw(createSQL);
        const schemaJson = JSON.stringify({ type: tbl.type || 'sql', columns: tbl.columns, template: template_key });
        await sql`INSERT INTO tb_table_registry (user_id, table_name, physical_name, table_type, schema) VALUES (${user.id}, ${cleanName}, ${physName}, ${tbl.type || 'sql'}, ${schemaJson})`;
        if (with_sample && tbl.sample && tbl.sample.length > 0) {
          for (const row of tbl.sample) {
            const entries = Object.entries(row);
            const keys = entries.map(([k]) => `"${safeName(k)}"`).join(', ');
            const vals = entries.map(([, v]) => v === '' ? null : v);
            const phs = vals.map((_, i) => `$${i + 1}`).join(', ');
            try { await runRaw(`INSERT INTO "${physName}" (${keys}) VALUES (${phs})`, vals); } catch (e) {}
          }
        }
        results.push({ name: tbl.name, status: 'created', type: tbl.type || 'sql' });
      } catch (e) { results.push({ name: tbl.name, status: 'error', error: e.message }); }
    }
    await sql`INSERT INTO tb_activity (user_id, action, details) VALUES (${user.id}, 'apply_template', ${`Applied: ${tpl.name}`})`;
    return res.json({ results, template: tpl.name });
  }

  // DELETE
  if (action === 'delete') {
    const { table_name } = req.body || {};
    try {
      const rows = await sql`SELECT * FROM tb_table_registry WHERE user_id = ${user.id} AND table_name = ${table_name}`;
      if (!rows.length) return res.status(404).json({ error: 'Table not found' });
      await runRaw(`DROP TABLE IF EXISTS "${rows[0].physical_name}"`);
      await sql`DELETE FROM tb_table_registry WHERE id = ${rows[0].id}`;
      return res.json({ success: true });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  // RENAME
  if (action === 'rename') {
    const { table_name, new_name } = req.body || {};
    try {
      const rows = await sql`SELECT * FROM tb_table_registry WHERE user_id = ${user.id} AND table_name = ${table_name}`;
      if (!rows.length) return res.status(404).json({ error: 'Table not found' });
      await sql`UPDATE tb_table_registry SET table_name = ${safeName(new_name)} WHERE id = ${rows[0].id}`;
      return res.json({ success: true });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  // DUPLICATE
  if (action === 'duplicate') {
    const limit = await checkLimit(user.id, 'tables');
    if (!limit.allowed) return res.status(400).json({ error: limit.message });
    const { table_name } = req.body || {};
    try {
      const rows = await sql`SELECT * FROM tb_table_registry WHERE user_id = ${user.id} AND table_name = ${table_name}`;
      if (!rows.length) return res.status(404).json({ error: 'Table not found' });
      const newName = safeName(table_name + '_copy');
      const newPhys = userTableName(user.id, newName + '_' + Date.now());
      await runRaw(`CREATE TABLE "${newPhys}" AS SELECT * FROM "${rows[0].physical_name}"`);
      const nr = await sql`INSERT INTO tb_table_registry (user_id, table_name, physical_name, table_type, schema) VALUES (${user.id}, ${newName}, ${newPhys}, ${rows[0].table_type || 'sql'}, ${rows[0].schema}) RETURNING *`;
      return res.status(201).json({ table: nr[0] });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  // ADD COLUMN
  if (action === 'addcol') {
    const { table_name, column_name, column_type, not_null, default_val } = req.body || {};
    try {
      const rows = await sql`SELECT * FROM tb_table_registry WHERE user_id = ${user.id} AND table_name = ${table_name}`;
      if (!rows.length) return res.status(404).json({ error: 'Table not found' });
      if (rows[0].table_type === 'collection') return res.status(400).json({ error: 'Collections use JSONB — no column management needed' });
      let alterSQL = `ALTER TABLE "${rows[0].physical_name}" ADD COLUMN "${safeName(column_name)}" ${safeType(column_type)}`;
      if (not_null && default_val !== undefined) alterSQL += ` NOT NULL DEFAULT '${default_val}'`;
      else if (default_val !== undefined && default_val !== '') alterSQL += ` DEFAULT '${default_val}'`;
      await runRaw(alterSQL);
      return res.json({ success: true });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  // DROP COLUMN
  if (action === 'dropcol') {
    const { table_name, column_name } = req.body || {};
    try {
      const rows = await sql`SELECT * FROM tb_table_registry WHERE user_id = ${user.id} AND table_name = ${table_name}`;
      if (!rows.length) return res.status(404).json({ error: 'Table not found' });
      await runRaw(`ALTER TABLE "${rows[0].physical_name}" DROP COLUMN IF EXISTS "${safeName(column_name)}"`);
      return res.json({ success: true });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  // GET COLUMNS
  if (action === 'columns') {
    const { table_name } = req.query;
    try {
      const rows = await sql`SELECT * FROM tb_table_registry WHERE user_id = ${user.id} AND table_name = ${table_name}`;
      if (!rows.length) return res.status(404).json({ error: 'Table not found' });
      const cols = await sql`SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name = ${rows[0].physical_name} ORDER BY ordinal_position`;
      return res.json({ columns: cols, table_type: rows[0].table_type });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  // CSV EXPORT
  if (action === 'export') {
    const { table_name } = req.query;
    try {
      const rows = await sql`SELECT * FROM tb_table_registry WHERE user_id = ${user.id} AND table_name = ${table_name}`;
      if (!rows.length) return res.status(404).json({ error: 'Table not found' });
      const data = await runRaw(`SELECT * FROM "${rows[0].physical_name}" ORDER BY id`);
      if (!data.length) return res.json({ csv: '' });
      const headers = Object.keys(data[0]).join(',');
      const csvRows = data.map(row => Object.values(row).map(v => v === null ? '' : `"${String(v).replace(/"/g, '""')}"`).join(','));
      return res.json({ csv: [headers, ...csvRows].join('\n'), filename: `${table_name}.csv` });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  // CSV IMPORT
  if (action === 'import') {
    const { table_name, csv_data } = req.body || {};
    try {
      const rows = await sql`SELECT * FROM tb_table_registry WHERE user_id = ${user.id} AND table_name = ${table_name}`;
      if (!rows.length) return res.status(404).json({ error: 'Table not found' });
      const lines = csv_data.trim().split('\n');
      const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
      let imported = 0;
      for (let i = 1; i < lines.length; i++) {
        const vals = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, '') || null);
        const fh = headers.filter(h => h !== 'id');
        const fv = headers.map((h, idx) => h === 'id' ? null : vals[idx]).filter((_, idx) => headers[idx] !== 'id');
        if (!fh.length) continue;
        const keys = fh.map(h => `"${safeName(h)}"`).join(', ');
        const phs = fv.map((_, pi) => `$${pi + 1}`).join(', ');
        try { await runRaw(`INSERT INTO "${rows[0].physical_name}" (${keys}) VALUES (${phs})`, fv); imported++; } catch (e) {}
      }
      return res.json({ success: true, imported });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
