-- =====================================================================
-- Seed data: ports content from app/*/data.ts into the database.
-- UGX prices converted at ~3,700 UGX/USD, rounded to nearest 10,000 UGX.
-- Run via: supabase db reset (auto), or paste into the SQL editor.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Room types (was app/rooms/data.ts)
-- ---------------------------------------------------------------------
insert into public.room_types (
  slug, title, description, overview, price_ugx, cover_image_url,
  details, amenities, dining_hours, gallery, inventory_count, sort_order
) values
(
  'garden-deluxe-room',
  'Garden Deluxe Room',
  'Spacious comfort with a private balcony overlooking landscaped gardens.',
  'The Garden Deluxe Room offers generous space, warm neutral interiors, and private outdoor views for a calm, restful stay.',
  350000,
  'https://images.unsplash.com/photo-1566665797739-1674de7a421a?auto=format&fit=crop&w=1400&q=80',
  array[
    'Private balcony facing landscaped gardens.',
    'Queen bed with premium linen and blackout curtains.',
    'Comfortable work corner for remote work or planning.'
  ],
  array[
    'Complimentary high-speed Wi-Fi',
    'Smart TV with entertainment channels',
    'Rain shower bathroom',
    'Tea and coffee station',
    'Daily housekeeping'
  ],
  array[
    'Breakfast: 7:00 AM - 8:00 AM',
    'Lunch: 1:00 PM - 2:00 PM',
    'Dinner: 7:00 PM - 8:00 PM'
  ],
  array[
    'https://images.unsplash.com/photo-1566665797739-1674de7a421a?auto=format&fit=crop&w=1400&q=80',
    'https://images.unsplash.com/photo-1611892440504-42a792e24d32?auto=format&fit=crop&w=1400&q=80',
    'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?auto=format&fit=crop&w=1400&q=80'
  ],
  3, 1
),
(
  'executive-suite',
  'Executive Suite',
  'An elevated stay with a lounge area, premium bedding, and curated amenities.',
  'The Executive Suite is designed for guests who want extra room, a premium finish, and a quiet place to both work and unwind.',
  540000,
  'https://images.unsplash.com/photo-1591088398332-8a7791972843?auto=format&fit=crop&w=1400&q=80',
  array[
    'Dedicated lounge area with comfortable seating.',
    'Premium bed setting with elevated room finishes.',
    'Spacious layout ideal for longer stays.'
  ],
  array[
    'Complimentary high-speed Wi-Fi',
    'Smart TV with entertainment channels',
    'Rain shower bathroom',
    'Tea and coffee station',
    'Daily housekeeping'
  ],
  array[
    'Breakfast: 7:00 AM - 8:00 AM',
    'Lunch: 1:00 PM - 2:00 PM',
    'Dinner: 7:00 PM - 8:00 PM'
  ],
  array[
    'https://images.unsplash.com/photo-1591088398332-8a7791972843?auto=format&fit=crop&w=1400&q=80',
    'https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=1400&q=80',
    'https://images.unsplash.com/photo-1584132967334-10e028bd69f7?auto=format&fit=crop&w=1400&q=80'
  ],
  2, 2
),
(
  'family-courtyard-room',
  'Family Courtyard Room',
  'Comfortable multi-bed layout designed for shared travel and family retreats.',
  'The Family Courtyard Room is designed for shared stays, offering practical comfort, easy movement, and a relaxed setting for groups.',
  460000,
  'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?auto=format&fit=crop&w=1400&q=80',
  array[
    'Flexible sleeping layout for family travel.',
    'Easy access to courtyard and shared outdoor areas.',
    'Spacious interior for comfortable day-to-day use.'
  ],
  array[
    'Complimentary high-speed Wi-Fi',
    'Smart TV with entertainment channels',
    'Rain shower bathroom',
    'Tea and coffee station',
    'Daily housekeeping'
  ],
  array[
    'Breakfast: 7:00 AM - 8:00 AM',
    'Lunch: 1:00 PM - 2:00 PM',
    'Dinner: 7:00 PM - 8:00 PM'
  ],
  array[
    'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?auto=format&fit=crop&w=1400&q=80',
    'https://images.unsplash.com/photo-1598928636135-d146006ff4be?auto=format&fit=crop&w=1400&q=80',
    'https://images.unsplash.com/photo-1611892440504-42a792e24d32?auto=format&fit=crop&w=1400&q=80'
  ],
  2, 3
),
(
  'signature-honeymoon-suite',
  'Signature Honeymoon Suite',
  'Romantic ambiance with scenic views and special in-room hospitality touches.',
  'The Signature Honeymoon Suite offers romantic styling, elevated privacy, and warm ambience crafted for memorable couple stays.',
  650000,
  'https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=1400&q=80',
  array[
    'Elegant suite layout with intimate lounge corner.',
    'Private setting designed for quiet, uninterrupted relaxation.',
    'Ideal for anniversaries, honeymoon escapes, and special occasions.'
  ],
  array[
    'Complimentary high-speed Wi-Fi',
    'Smart TV with entertainment channels',
    'Rain shower bathroom',
    'Tea and coffee station',
    'Daily housekeeping'
  ],
  array[
    'Breakfast: 7:00 AM - 8:00 AM',
    'Lunch: 1:00 PM - 2:00 PM',
    'Dinner: 7:00 PM - 8:00 PM'
  ],
  array[
    'https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=1400&q=80',
    'https://images.unsplash.com/photo-1591088398332-8a7791972843?auto=format&fit=crop&w=1400&q=80',
    'https://images.unsplash.com/photo-1584132967334-10e028bd69f7?auto=format&fit=crop&w=1400&q=80'
  ],
  1, 4
),
(
  'country-view-room',
  'Country View Room',
  'A restful room with warm interiors and panoramic countryside scenery.',
  'The Country View Room combines warm interiors with scenic surroundings, creating a simple and peaceful retreat for everyday comfort.',
  390000,
  'https://images.unsplash.com/photo-1598928636135-d146006ff4be?auto=format&fit=crop&w=1400&q=80',
  array[
    'Calm room setting with countryside-facing views.',
    'Comfort-first layout suited for solo or couple stays.',
    'Natural light and restful ambience throughout the day.'
  ],
  array[
    'Complimentary high-speed Wi-Fi',
    'Smart TV with entertainment channels',
    'Rain shower bathroom',
    'Tea and coffee station',
    'Daily housekeeping'
  ],
  array[
    'Breakfast: 7:00 AM - 8:00 AM',
    'Lunch: 1:00 PM - 2:00 PM',
    'Dinner: 7:00 PM - 8:00 PM'
  ],
  array[
    'https://images.unsplash.com/photo-1598928636135-d146006ff4be?auto=format&fit=crop&w=1400&q=80',
    'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?auto=format&fit=crop&w=1400&q=80',
    'https://images.unsplash.com/photo-1566665797739-1674de7a421a?auto=format&fit=crop&w=1400&q=80'
  ],
  3, 5
),
(
  'private-terrace-suite',
  'Private Terrace Suite',
  'Large suite with dedicated terrace space ideal for longer relaxed stays.',
  'The Private Terrace Suite offers extra space and an outdoor terrace for guests who prefer a more open, extended-stay experience.',
  590000,
  'https://images.unsplash.com/photo-1584132967334-10e028bd69f7?auto=format&fit=crop&w=1400&q=80',
  array[
    'Private terrace area for fresh air and outdoor lounging.',
    'Generous suite layout with flexible living space.',
    'Suitable for longer stays and premium comfort seekers.'
  ],
  array[
    'Complimentary high-speed Wi-Fi',
    'Smart TV with entertainment channels',
    'Rain shower bathroom',
    'Tea and coffee station',
    'Daily housekeeping'
  ],
  array[
    'Breakfast: 7:00 AM - 8:00 AM',
    'Lunch: 1:00 PM - 2:00 PM',
    'Dinner: 7:00 PM - 8:00 PM'
  ],
  array[
    'https://images.unsplash.com/photo-1584132967334-10e028bd69f7?auto=format&fit=crop&w=1400&q=80',
    'https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=1400&q=80',
    'https://images.unsplash.com/photo-1611892440504-42a792e24d32?auto=format&fit=crop&w=1400&q=80'
  ],
  2, 6
);

-- ---------------------------------------------------------------------
-- Amenities (was app/amenities/data.ts)
-- ---------------------------------------------------------------------
insert into public.amenities (
  slug, icon, title, description, overview, highlights, gallery, sort_order
) values
(
  'swimming-pool', 'POOL', 'Swimming Pool',
  'Relax by the poolside with sun loungers, refreshments, and peaceful views.',
  'Our swimming pool area offers a calm daytime retreat with comfortable seating and a clean, family-friendly atmosphere.',
  array[
    'Well-maintained pool and lounging areas.',
    'Poolside refreshment service available.',
    'Ideal for both morning and evening relaxation.'
  ],
  array[
    'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=1400&q=80',
    'https://images.unsplash.com/photo-1578898887932-dce23a595ad4?auto=format&fit=crop&w=1400&q=80',
    'https://images.unsplash.com/photo-1564501049412-61c2a3083791?auto=format&fit=crop&w=1400&q=80'
  ],
  1
),
(
  'dining-and-bar', 'DINE', 'Dining & Bar',
  'Fresh local cuisine, continental favorites, and a cozy evening lounge bar.',
  'The dining experience blends local flavor and familiar classics in a warm space suited for both casual and special meals.',
  array[
    'Breakfast, lunch, and dinner service.',
    'Local and continental menu selection.',
    'Relaxed evening lounge bar ambience.'
  ],
  array[
    'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=1400&q=80',
    'https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?auto=format&fit=crop&w=1400&q=80',
    'https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&w=1400&q=80'
  ],
  2
),
(
  'events-and-weddings', 'EVENT', 'Events & Weddings',
  'Flexible indoor and outdoor venues for celebrations, conferences, and retreats.',
  'From weddings to corporate gatherings, our event spaces are adaptable, elegant, and supported by an experienced team.',
  array[
    'Indoor and outdoor venue options.',
    'Support for layout, decor, and guest flow.',
    'Suitable for social and corporate events.'
  ],
  array[
    'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&w=1400&q=80',
    'https://images.unsplash.com/photo-1478146896981-b80fe463b330?auto=format&fit=crop&w=1400&q=80',
    'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=1400&q=80'
  ],
  3
),
(
  'high-speed-wifi', 'WIFI', 'High-Speed Wi-Fi',
  'Reliable connectivity throughout guest rooms, event areas, and lounge spaces.',
  'Stay connected across the resort with stable internet access designed for both leisure browsing and work tasks.',
  array[
    'Coverage in rooms, lounges, and event areas.',
    'Suitable for meetings and remote work needs.',
    'Consistent connection quality across guest zones.'
  ],
  array[
    'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1400&q=80',
    'https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=1400&q=80',
    'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1400&q=80'
  ],
  4
),
(
  'ample-parking', 'PARK', 'Ample Parking',
  'Secure on-site parking with convenient access for private and group travel.',
  'Guests enjoy easy arrivals and departures with spacious, secure parking close to accommodation and key resort areas.',
  array[
    'On-site parking with easy entry and exit.',
    'Suitable for private vehicles and group transport.',
    'Convenient access to main guest areas.'
  ],
  array[
    'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1400&q=80',
    'https://images.unsplash.com/photo-1470246973918-29a93221c455?auto=format&fit=crop&w=1400&q=80',
    'https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=1400&q=80'
  ],
  5
),
(
  'wellness-spaces', 'WELL', 'Wellness Spaces',
  'Quiet lawns and serene corners for yoga, meditation, and restorative downtime.',
  'Our wellness spaces are designed to support rest, breathing, and gentle movement in a naturally calm setting.',
  array[
    'Quiet open-air spaces for mindfulness.',
    'Comfortable corners for reflection and reading.',
    'Peaceful atmosphere for low-impact routines.'
  ],
  array[
    'https://images.unsplash.com/photo-1506126613408-eca07ce68773?auto=format&fit=crop&w=1400&q=80',
    'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?auto=format&fit=crop&w=1400&q=80',
    'https://images.unsplash.com/photo-1470246973918-29a93221c455?auto=format&fit=crop&w=1400&q=80'
  ],
  6
);

-- ---------------------------------------------------------------------
-- Experiences (was app/experiences/data.ts)
-- ---------------------------------------------------------------------
insert into public.experiences (
  slug, title, body, image, overview, details, gallery, sort_order
) values
(
  'sunset-garden-walks',
  'Sunset Garden Walks',
  'Explore landscaped paths and serene viewpoints around the resort grounds.',
  'https://images.unsplash.com/photo-1470246973918-29a93221c455?auto=format&fit=crop&w=1200&q=80',
  'Take gentle evening walks through curated greenery, stone pathways, and quiet corners designed for rest and reflection.',
  array[
    'Guided and self-paced routes available daily.',
    'Best enjoyed between 5:30 PM and 7:00 PM.',
    'Photo-friendly viewpoints across the gardens.'
  ],
  array[
    'https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=1400&q=80',
    'https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=1400&q=80',
    'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1400&q=80'
  ],
  1
),
(
  'farm-to-table-dining',
  'Farm-to-Table Dining',
  'Enjoy seasonal menus inspired by local produce and regional flavor.',
  'https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?auto=format&fit=crop&w=1200&q=80',
  'Our chefs prepare fresh dishes with local ingredients, balancing comfort classics and contemporary East African flavor.',
  array[
    'Seasonal breakfast, lunch, and dinner menus.',
    'Vegetarian and family-friendly options available.',
    'Private dining can be arranged with advance booking.'
  ],
  array[
    'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=1400&q=80',
    'https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&w=1400&q=80',
    'https://images.unsplash.com/photo-1555244162-803834f70033?auto=format&fit=crop&w=1400&q=80'
  ],
  2
),
(
  'private-event-spaces',
  'Private Event Spaces',
  'Host weddings, retreats, and celebrations in elegant indoor and outdoor venues.',
  'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=1200&q=80',
  'From intimate celebrations to corporate retreats, our spaces are designed for flexibility, ambience, and smooth coordination.',
  array[
    'Indoor halls and outdoor lawn setups available.',
    'Support for decor, seating, and event flow.',
    'Suitable for weddings, conferences, and private functions.'
  ],
  array[
    'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&w=1400&q=80',
    'https://images.unsplash.com/photo-1478146896981-b80fe463b330?auto=format&fit=crop&w=1400&q=80',
    'https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?auto=format&fit=crop&w=1400&q=80'
  ],
  3
),
(
  'quiet-wellness-moments',
  'Quiet Wellness Moments',
  'Recharge with calm lounge areas, sunrise yoga lawns, and restorative atmosphere.',
  'https://images.unsplash.com/photo-1506126613408-eca07ce68773?auto=format&fit=crop&w=1200&q=80',
  'Slow down with restful spaces, gentle morning routines, and a calm environment that supports physical and mental reset.',
  array[
    'Open-air breathing and stretching areas.',
    'Quiet lounge corners for reading and reflection.',
    'Peaceful mornings with garden views.'
  ],
  array[
    'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?auto=format&fit=crop&w=1400&q=80',
    'https://images.unsplash.com/photo-1508672019048-805c876b67e2?auto=format&fit=crop&w=1400&q=80',
    'https://images.unsplash.com/photo-1545389336-cf090694435e?auto=format&fit=crop&w=1400&q=80'
  ],
  4
);

-- ---------------------------------------------------------------------
-- Services (was app/services/data.ts)
-- ---------------------------------------------------------------------
insert into public.services (
  slug, title, image, summary, overview, details, gallery, sort_order
) values
(
  'poolside-leisure',
  'Poolside Leisure',
  'https://images.unsplash.com/photo-1564501049412-61c2a3083791?auto=format&fit=crop&w=900&q=80',
  'Unwind by the water with calm views, lounge seating, and all-day relaxation.',
  'Our poolside setting is designed for restful afternoons and easy social moments, with shaded seats and drinks available nearby.',
  array[
    'Comfortable seating and shaded areas.',
    'Refreshing drinks and light bites available.',
    'Ideal for both solo and family downtime.'
  ],
  array[
    'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=1400&q=80',
    'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1400&q=80',
    'https://images.unsplash.com/photo-1578683010236-d716f9a3f461?auto=format&fit=crop&w=1400&q=80'
  ],
  1
),
(
  'signature-dining',
  'Signature Dining',
  'https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&w=900&q=80',
  'Fresh menus, warm ambiance, and curated meals from morning to evening.',
  'Signature Dining combines local ingredients with refined presentation, giving guests a memorable food experience throughout their stay.',
  array[
    'Breakfast, lunch, and dinner service.',
    'Local and continental menu options.',
    'Private table arrangements available on request.'
  ],
  array[
    'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=1400&q=80',
    'https://images.unsplash.com/photo-1555244162-803834f70033?auto=format&fit=crop&w=1400&q=80',
    'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1400&q=80'
  ],
  2
),
(
  'garden-escapes',
  'Garden Escapes',
  'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=900&q=80',
  'Step into peaceful greenery and quiet corners across the resort grounds.',
  'Garden Escapes offers scenic paths, restful benches, and open-air spaces for reading, walking, and gentle reflection.',
  array[
    'Landscaped walkways and relaxation spots.',
    'Photo-friendly scenery and natural light.',
    'Perfect for morning walks and evening unwinding.'
  ],
  array[
    'https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=1400&q=80',
    'https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=1400&q=80',
    'https://images.unsplash.com/photo-1470246973918-29a93221c455?auto=format&fit=crop&w=1400&q=80'
  ],
  3
);

-- ---------------------------------------------------------------------
-- Gallery images (was app/gallery/page.tsx)
-- ---------------------------------------------------------------------
insert into public.gallery_images (image_url, sort_order) values
('https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=1400&q=80', 1),
('https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1200&q=80', 2),
('https://images.unsplash.com/photo-1519823551278-64ac92734fb1?auto=format&fit=crop&w=1400&q=80', 3),
('https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=1200&q=80', 4),
('https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=1400&q=80', 5),
('https://images.unsplash.com/photo-1445019980597-93fa8acb246c?auto=format&fit=crop&w=1200&q=80', 6),
('https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1400&q=80', 7),
('https://images.unsplash.com/photo-1470246973918-29a93221c455?auto=format&fit=crop&w=1200&q=80', 8),
('https://images.unsplash.com/photo-1512918728675-ed5a9ecdebfd?auto=format&fit=crop&w=1400&q=80', 9);

commit;
